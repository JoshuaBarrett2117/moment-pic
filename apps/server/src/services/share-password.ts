import crypto from "node:crypto";
import { MAX_PASSWORD_LENGTH } from "../config/security.js";
import { WorkBudget } from "../lib/work-budget.js";

const deriveKey = (password: string, salt: string): Promise<Buffer> => new Promise((resolve, reject) => {
  crypto.scrypt(password, salt, 64, (error, derived) => error ? reject(error) : resolve(derived));
});

export class SharePasswordService {
  constructor(private readonly budget = new WorkBudget(2, 16), private readonly derive = deriveKey, private readonly queueWaitMs = 5000) {}

  private async run<Result>(operation: () => Promise<Result>, signal?: AbortSignal): Promise<Result> {
    const waiting = new AbortController();
    const timer = setTimeout(() => waiting.abort(Object.assign(new Error("分享密码计算排队超时"), { statusCode: 503 })), this.queueWaitMs);
    const queueSignal = signal ? AbortSignal.any([signal, waiting.signal]) : waiting.signal;
    let release: () => void;
    try {
      release = await this.budget.acquire(queueSignal);
    } catch (error) {
      if (waiting.signal.aborted && !signal?.aborted) throw waiting.signal.reason;
      throw error;
    } finally { clearTimeout(timer); }
    const running = Promise.resolve().then(() => {
      signal?.throwIfAborted();
      return operation();
    }).finally(release);
    if (!signal) return running;
    return new Promise<Result>((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      running.then((result) => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) reject(signal.reason);
        else resolve(result);
      }, (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      });
      if (signal.aborted) abort();
    });
  }

  private validate(password: string): void {
    if (!password.length || password.length > MAX_PASSWORD_LENGTH) throw Object.assign(new Error("分享密码长度必须为 1–128 个字符"), { statusCode: 400 });
  }

  async hash(password: string, signal?: AbortSignal): Promise<string> {
    this.validate(password);
    return this.run(async () => {
      const salt = crypto.randomBytes(16).toString("hex");
      return `${salt}:${(await this.derive(password, salt)).toString("hex")}`;
    }, signal);
  }

  async verify(password: string, stored: string, signal?: AbortSignal): Promise<boolean> {
    this.validate(password);
    if (!/^[a-f\d]{32}:[a-f\d]{128}$/.test(stored)) return false;
    const [salt, hash] = stored.split(":");
    return this.run(async () => crypto.timingSafeEqual(await this.derive(password, salt), Buffer.from(hash, "hex")), signal);
  }
}

export const sharePasswords = new SharePasswordService();
