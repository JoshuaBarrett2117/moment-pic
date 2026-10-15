import crypto from "node:crypto";
import { MAX_PASSWORD_LENGTH } from "../config/security.js";
import { WorkBudget } from "../lib/work-budget.js";

const deriveKey = (password: string, salt: string): Promise<Buffer> => new Promise((resolve, reject) => {
  crypto.scrypt(password, salt, 64, (error, derived) => error ? reject(error) : resolve(derived));
});

export class SharePasswordService {
  constructor(private readonly budget = new WorkBudget(2, 16), private readonly derive = deriveKey) {}

  private validate(password: string): void {
    if (!password.length || password.length > MAX_PASSWORD_LENGTH) throw Object.assign(new Error("分享密码长度必须为 1–128 个字符"), { statusCode: 400 });
  }

  async hash(password: string): Promise<string> {
    this.validate(password);
    return this.budget.run(async () => {
      const salt = crypto.randomBytes(16).toString("hex");
      return `${salt}:${(await this.derive(password, salt)).toString("hex")}`;
    });
  }

  async verify(password: string, stored: string): Promise<boolean> {
    this.validate(password);
    if (!/^[a-f\d]{32}:[a-f\d]{128}$/.test(stored)) return false;
    const [salt, hash] = stored.split(":");
    return this.budget.run(async () => crypto.timingSafeEqual(await this.derive(password, salt), Buffer.from(hash, "hex")));
  }
}

export const sharePasswords = new SharePasswordService();
