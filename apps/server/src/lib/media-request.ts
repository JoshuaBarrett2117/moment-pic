import type { FastifyReply, FastifyRequest } from "fastify";

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
