import type { Readable } from "node:stream";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
import { ArchiveSafetyError, MAX_ENTRY_BYTES, type ArchiveOptions } from "./archive/archive-limits.js";
import { ArchiveExtractCache, createDefaultExtractorResolver } from "./archive/extract-cache.js";

import { detectArchiveType, extractJpegFromPsd, SUPPORTED_ARCHIVE_EXTENSIONS } from "./archive-utils.js";
import { normalizeExtension } from "../lib/paths.js";
import { toArchiveBody } from "./archive/archive-body.js";
import { collectCbrImageEntries, readCbrBuffer, readCbrStream } from "./archive/cbr-reader.js";
import { collect7zImageEntries, read7zBuffer, read7zStream } from "./archive/sevenzip-reader.js";
import type { ArchiveImageEntry } from "./archive/archive-types.js";
import { collectZipImageEntries, readZipBuffer, readZipStream, readZipHead, readZipHeads } from "./archive/zip-reader.js";

export { detectArchiveType } from "./archive-utils.js";
export type { ArchiveImageEntry } from "./archive/archive-types.js";

/** 7z/RAR 整包解压缓存：首次访问时顺序解压整包，后续条目直接读缓存文件，避免固实包 O(n²)。 */
export const archiveExtractCache = new ArchiveExtractCache(
  { dir: path.join(env.cacheDir, "archive-extract"), maxBytes: env.archiveExtractCacheMaxBytes },
  createDefaultExtractorResolver()
);

/** 命中缓存时返回缓存文件路径；不可缓存或等待超过请求时限时返回 null，调用方走逐条读取。 */
const resolveExtractedEntry = async (archivePath: string, entryPath: string, options: ArchiveOptions): Promise<string | null> => {
  const type = detectArchiveType(archivePath);
  if (type !== "7z" && type !== "cbr") return null;
  const file = await archiveExtractCache.resolve(archivePath, entryPath, { signal: options.signal, waitMs: options.timeoutMs ?? 30_000 });
  if (!file) return null;
  const { size } = await fs.promises.stat(file);
  if (size > (options.maxBytes ?? MAX_ENTRY_BYTES)) throw new ArchiveSafetyError("ARCHIVE_BYTE_LIMIT", "归档解压字节数超过上限");
  return file;
};

export const isArchiveFile = async (filePath: string, stats?: fs.Stats): Promise<boolean> => {
  if (stats && !stats.isFile()) {
    return false;
  }

  return SUPPORTED_ARCHIVE_EXTENSIONS.has(normalizeExtension(filePath));
};

const collectAllImageEntries = async (archivePath: string, options: ArchiveOptions = {}): Promise<ArchiveImageEntry[]> => {
  const archiveType = detectArchiveType(archivePath);
  if (!archiveType) {
    throw new Error(`unsupported archive format: ${archivePath}`);
  }

  if (archiveType === "zip") {
    return collectZipImageEntries(archivePath, options);
  }

  if (archiveType === "cbr") {
    return collectCbrImageEntries(archivePath, options);
  }

  if (archiveType === "7z") {
    return collect7zImageEntries(archivePath, options);
  }

  throw new Error(`archive format handler is not implemented: ${archiveType}`);
};

export const listRootImageEntries = async (archivePath: string, options: ArchiveOptions = {}): Promise<ArchiveImageEntry[]> => {
  const entries = await collectAllImageEntries(archivePath, options);
  const rootImages = entries.filter((entry) => !entry.entryPath.includes("/"));
  const nestedImages = entries.filter((entry) => entry.entryPath.includes("/"));

  if (rootImages.length === 0 || nestedImages.length === 0) {
    return rootImages.length > 0 ? rootImages : entries;
  }

  const sumSize = (items: ArchiveImageEntry[]) => items.reduce((total, item) => total + item.sizeBytes, 0);
  const rootSize = sumSize(rootImages);
  const nestedSize = sumSize(nestedImages);

  return nestedSize > rootSize ? nestedImages : rootImages;
};

export const readArchiveEntryBuffer = async (archivePath: string, entryPath: string, options: ArchiveOptions = {}): Promise<Buffer> => {
  const archiveType = detectArchiveType(archivePath);
  if (!archiveType) {
    throw new Error(`unsupported archive format: ${archivePath}`);
  }

  if (archiveType === "zip") {
    return readZipBuffer(archivePath, entryPath, options);
  }

  const extracted = await resolveExtractedEntry(archivePath, entryPath, options);
  if (extracted) return extractJpegFromPsd(await fs.promises.readFile(extracted));

  if (archiveType === "cbr") {
    return readCbrBuffer(archivePath, entryPath, options);
  }

  if (archiveType === "7z") {
    return read7zBuffer(archivePath, entryPath, options);
  }

  throw new Error(`archive format reader is not implemented: ${archiveType}`);
};

export const openArchiveEntryBody = async (archivePath: string, entryPath: string, options: ArchiveOptions = {}): Promise<Readable | Buffer> => {
  const archiveType = detectArchiveType(archivePath);
  if (!archiveType) {
    throw new Error(`unsupported archive format: ${archivePath}`);
  }

  if (archiveType === "zip") {
    return toArchiveBody(readZipStream(archivePath, entryPath, options));
  }

  const extracted = await resolveExtractedEntry(archivePath, entryPath, options);
  if (extracted) return toArchiveBody(Promise.resolve(fs.createReadStream(extracted)));

  if (archiveType === "cbr") {
    return toArchiveBody(readCbrStream(archivePath, entryPath, options));
  }

  if (archiveType === "7z") {
    return toArchiveBody(read7zStream(archivePath, entryPath, options));
  }

  throw new Error(`archive format stream reader is not implemented: ${archiveType}`);
};

/** 头部探测仅支持 ZIP；RAR/7z 保持既有解码通道。 */
export const readArchiveEntryHead = async (archivePath: string, entryPath: string, options: ArchiveOptions = {}): Promise<Buffer> => {
  if (detectArchiveType(archivePath) !== "zip") throw new Error("仅 ZIP 支持有界头部探测");
  return readZipHead(archivePath, entryPath, options);
};

/** 批量头部探测：ZIP 只打开一次、中央目录只读一遍（仅 ZIP）。 */
export const readArchiveEntryHeads = async (
  archivePath: string,
  entryPaths: Iterable<string>,
  onHead: (entryPath: string, head: Buffer | null) => void,
  options: ArchiveOptions = {}
): Promise<void> => {
  if (detectArchiveType(archivePath) !== "zip") throw new Error("仅 ZIP 支持有界头部探测");
  return readZipHeads(archivePath, entryPaths, onHead, options);
};
