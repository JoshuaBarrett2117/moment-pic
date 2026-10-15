export class ResourceBusyError extends Error {
  readonly statusCode = 503;
  constructor() { super("处理任务已满，请稍后重试"); }
}

type Waiter = { resolve: (release: () => void) => void; reject: (error: Error) => void; signal?: AbortSignal; abort: () => void };

export class WorkBudget {
  private active = 0;
  private readonly waiting: Waiter[] = [];
  constructor(private readonly concurrency: number, private readonly maxWaiting: number) {}

  async acquire(signal?: AbortSignal): Promise<() => void> {
    signal?.throwIfAborted();
    if (this.active < this.concurrency) { this.active += 1; return this.releaseOnce(); }
    if (this.waiting.length >= this.maxWaiting) throw new ResourceBusyError();
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { resolve, reject, signal, abort: () => {
        const index = this.waiting.indexOf(waiter);
        if (index >= 0) this.waiting.splice(index, 1);
        reject(new DOMException("请求已取消", "AbortError"));
      } };
      signal?.addEventListener("abort", waiter.abort, { once: true });
      this.waiting.push(waiter);
    });
  }

  private releaseOnce(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiting.shift();
      if (next) {
        next.signal?.removeEventListener("abort", next.abort);
        next.resolve(this.releaseOnce());
      } else this.active -= 1;
    };
  }

  async run<Result>(operation: () => Promise<Result>, signal?: AbortSignal): Promise<Result> {
    const release = await this.acquire(signal);
    try { signal?.throwIfAborted(); return await operation(); } finally { release(); }
  }

  get usage(): { active: number; queued: number } { return { active: this.active, queued: this.waiting.length }; }
}
