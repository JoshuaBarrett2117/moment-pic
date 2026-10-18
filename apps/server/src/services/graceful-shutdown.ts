import { createLogger } from "../lib/logger.js";

const logger = createLogger("Shutdown");
export const installGracefulShutdown = (input: {
  stopWatching: () => Promise<void>;
  close: () => Promise<void>;
  exit?: (code: number) => void;
  timeoutMs?: number;
}): (() => void) => {
  const exit = input.exit ?? ((code: number) => process.exit(code));
  let running = false;
  let timer: NodeJS.Timeout | undefined;
  const shutdown = () => {
    if (running) return;
    running = true;
    logger.info("收到退出信号，停止监听并关闭服务");
    timer = setTimeout(() => { logger.error("优雅退出超过 10 秒，强制结束进程"); exit(1); }, input.timeoutMs ?? 10000);
    void (async () => {
      try {
        await input.stopWatching();
        await input.close();
        clearTimeout(timer);
        logger.info("服务已优雅退出");
        exit(0);
      } catch (error) { logger.error("优雅退出失败，等待强制退出期限", error); }
    })();
  };
  process.on("SIGTERM", shutdown); process.on("SIGINT", shutdown);
  return () => { clearTimeout(timer); process.off("SIGTERM", shutdown); process.off("SIGINT", shutdown); };
};
