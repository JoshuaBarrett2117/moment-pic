import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp, { type Metadata } from "sharp";

import { env } from "../config/env.js";

/** 用户自定义背景：每个账号一张，存放在数据库同级的 backgrounds/ 目录（与缓存分开，不会被缓存清理删掉）。 */
export const BACKGROUND_MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const BACKGROUND_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
const MAX_WIDTH = 2560;
const MAX_HEIGHT = 1600;
const MIN_EDGE = 320;
const MAX_INPUT_PIXELS = 80_000_000;

export type UserBackgroundInfo = { version: string; width: number; height: number; bytes: number; updatedAt: string };

export class BackgroundInputError extends Error {
  readonly statusCode = 400;
}

let queue: Promise<unknown> = Promise.resolve();
const runExclusive = <T>(task: () => Promise<T>): Promise<T> => {
  const result = queue.then(task, task);
  queue = result.catch(() => undefined);
  return result;
};

const backgroundDir = (): string => path.join(path.dirname(path.resolve(env.sqlitePath)), "backgrounds");

const fileFor = (userId: string): string => {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(userId)) throw new BackgroundInputError("非法用户 ID");
  return path.join(backgroundDir(), `${userId}.webp`);
};

const versionOf = (stat: { size: number; mtimeMs: number }): string =>
  createHash("sha1").update(`${stat.size}:${Math.round(stat.mtimeMs)}`).digest("hex").slice(0, 12);

export const getUserBackground = async (userId: string): Promise<(UserBackgroundInfo & { filePath: string }) | null> => {
  const filePath = fileFor(userId);
  try {
    const stat = await fs.stat(filePath);
    const meta = await sharp(filePath).metadata();
    return {
      filePath,
      version: versionOf(stat),
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      bytes: stat.size,
      updatedAt: stat.mtime.toISOString()
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

/** 统一转成 WebP：自动按 EXIF 旋转、去掉元数据（含 GPS）、限制最大尺寸，原子写入。 */
export const saveUserBackground = async (userId: string, input: Buffer): Promise<UserBackgroundInfo> => {
  const filePath = fileFor(userId);
  if (!input.length) throw new BackgroundInputError("图片为空");
  if (input.length > BACKGROUND_MAX_UPLOAD_BYTES) throw new BackgroundInputError("图片不能超过 15 MB");

  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new BackgroundInputError("无法识别的图片格式，请上传 JPG、PNG、WebP 或 AVIF");
  }
  // heif 容器只接受 AVIF（av1）；HEIC 在预编译的 sharp 里无法解码，直接给出明确提示
  const isAvif = meta.format === "heif" && meta.compression === "av1";
  if (meta.format === "heif" && !isAvif) throw new BackgroundInputError("暂不支持 HEIC，请先转换为 JPG 后再上传");
  if (!meta.format || !(["jpeg", "png", "webp"].includes(meta.format) || isAvif)) {
    throw new BackgroundInputError("只支持 JPG、PNG、WebP 或 AVIF 图片");
  }
  if ((meta.pages ?? 1) > 1) throw new BackgroundInputError("不支持动图，请上传静态图片");
  const width = meta.autoOrient?.width ?? meta.width ?? 0;
  const height = meta.autoOrient?.height ?? meta.height ?? 0;
  if (Math.min(width, height) < MIN_EDGE) throw new BackgroundInputError(`图片太小，短边至少 ${MIN_EDGE} 像素`);

  // 同一时间只转码一张，避免多人同时上传把小内存 NAS 撑满
  const output = await runExclusive(() => sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({ width: MAX_WIDTH, height: MAX_HEIGHT, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true }));

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tempPath, output.data);
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }
  const stat = await fs.stat(filePath);
  return { version: versionOf(stat), width: output.info.width, height: output.info.height, bytes: stat.size, updatedAt: stat.mtime.toISOString() };
};

export const removeUserBackground = async (userId: string): Promise<boolean> => {
  try {
    await fs.unlink(fileFor(userId));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};
