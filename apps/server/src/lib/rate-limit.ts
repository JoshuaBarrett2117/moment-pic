export class AttemptLimiter {
  private readonly windows = new Map<string, { count: number; until: number }>();

  constructor(private readonly limit: number, private readonly windowMs = 60_000, private readonly maxKeys = 10_000) {}

  allow(key: string, now = Date.now()): boolean {
    for (const [existing, window] of this.windows) {
      if (window.until <= now) this.windows.delete(existing);
    }
    let window = this.windows.get(key);
    if (!window) {
      if (this.windows.size >= this.maxKeys) return false;
      window = { count: 0, until: now + this.windowMs };
      this.windows.set(key, window);
    }
    window.count += 1;
    return window.count <= this.limit;
  }
}
