type QueueEntry = {
  resolve: () => void;
  timeout: NodeJS.Timeout;
};

export type ThumbnailRequestGateOptions = {
  maxActive: number;
  maxQueue: number;
  queueTimeoutMs: number;
};

export class ThumbnailRequestGate {
  private readonly maxActive: number;
  private readonly maxQueue: number;
  private readonly queueTimeoutMs: number;
  private activeRequests = 0;
  private readonly waitQueue: QueueEntry[] = [];

  constructor(options: ThumbnailRequestGateOptions) {
    this.maxActive = options.maxActive;
    this.maxQueue = options.maxQueue;
    this.queueTimeoutMs = options.queueTimeoutMs;
  }

  getStats() {
    return {
      active: this.activeRequests,
      queued: this.waitQueue.length
    };
  }

  private wakeNextRequest() {
    const next = this.waitQueue.shift();
    if (!next) {
      return;
    }
    clearTimeout(next.timeout);
    this.activeRequests += 1;
    next.resolve();
  }

  async acquire(): Promise<(() => void) | null> {
    if (this.activeRequests < this.maxActive) {
      this.activeRequests += 1;
    } else {
      if (this.waitQueue.length >= this.maxQueue) {
        return null;
      }

      const acquired = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          const index = this.waitQueue.findIndex((item) => item.timeout === timeout);
          if (index >= 0) {
            this.waitQueue.splice(index, 1);
          }
          resolve(false);
        }, this.queueTimeoutMs);

        this.waitQueue.push({
          timeout,
          resolve: () => resolve(true)
        });
      });

      if (!acquired) {
        return null;
      }
    }

    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.activeRequests = Math.max(0, this.activeRequests - 1);
      this.wakeNextRequest();
    };
  }
}
