import type { FastifyReply, FastifyRequest } from "fastify";

/** 499 Client Closed Request：客户端在响应完成前主动断开，不是服务端故障 */
export const CLIENT_CLOSED_STATUS = 499;

export const mediaRequestSignal = (request: FastifyRequest, reply: FastifyReply): AbortSignal => {
  const controller = new AbortController();
  const abort = () => controller.abort(new DOMException("媒体请求已取消", "AbortError"));
  const cleanup = () => { request.raw.off("aborted", abort); reply.raw.off("close", closed); };
  const closed = () => { if (!reply.raw.writableFinished) abort(); cleanup(); };
  request.raw.once("aborted", abort);
  reply.raw.once("close", closed);
  reply.raw.once("finish", cleanup);
  if (request.raw.aborted || reply.raw.destroyed) abort();
  return controller.signal;
};

/**
 * 是否为「客户端主动断开」导致的中止。
 * 这类中止（快速翻页、关闭页面、切换视图）属于正常用户行为，不能按服务端错误处理：
 * 它既不该回 500，也不该打成 error 级日志，否则真故障会被噪声淹没。
 */
export const isClientAbortError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError") return true;
  const cause = (error as { cause?: unknown }).cause;
  return cause instanceof Error && cause.name === "AbortError";
};

/** 响应通道是否已经不可写（客户端已断开或已应答完毕） */
export const isReplyChannelClosed = (reply: FastifyReply): boolean =>
  reply.raw.writableEnded || reply.raw.destroyed;
