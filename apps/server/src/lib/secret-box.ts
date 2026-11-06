import crypto from "node:crypto";

import { insertAppSecretIfMissingDb } from "../repositories/user-repository.js";
import { nowIso } from "./time.js";

const PREFIX = "enc:v1:";
const KEY_NAME = "secret-box-key";

/** 加密密钥随机生成并保存在数据库 app_secrets 中（与管理员密码无关）；数据库备份需一并妥善保管。 */
const getKey = (): Buffer =>
  Buffer.from(insertAppSecretIfMissingDb(KEY_NAME, crypto.randomBytes(32).toString("base64"), nowIso()), "base64");

export const isSealed = (value: string): boolean => value.startsWith(PREFIX);

/** AES-256-GCM 加密：enc:v1:<iv>:<tag>:<ciphertext>（base64url） */
export const sealSecret = (plain: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
};

/** 解密；兼容历史明文（未加前缀的值原样返回）。密钥不匹配时返回 null 而不是抛错。 */
export const openSecret = (stored: string): string | null => {
  if (!isSealed(stored)) return stored;
  try {
    const [iv, tag, data] = stored.slice(PREFIX.length).split(":");
    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
};
