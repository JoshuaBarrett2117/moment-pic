import fs from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { runChildStream } from "./child-stream.js";
import { collectBounded, MAX_LISTING_BYTES, MAX_ARCHIVE_ENTRIES, type ArchiveOptions } from "./archive-limits.js";

import { path7za } from "7zip-bin";

import { isSupportedImageExtension } from "../../lib/image-formats.js";
import { normalizeExtension } from "../../lib/paths.js";
import { extractJpegFromPsd, normalizeArchiveEntryPath } from "../archive-utils.js";
import type { ArchiveImageEntry } from "./archive-types.js";

const decode7zText = (buffer: Buffer): string => {
  if (process.platform === "win32") {
    try {
      return new TextDecoder("gbk").decode(buffer);
    } catch {
      return buffer.toString("utf8");
    }
  }

  return buffer.toString("utf8");
};

let cached7zExecutables: string[] | null = null;

const ensureExecutablePermission = async (binaryPath: string): Promise<void> => {
  if (process.platform === "win32") {
    return;
  }

  try {
    await fs.promises.access(binaryPath, fs.constants.X_OK);
  } catch {
    await fs.promises.chmod(binaryPath, 0o755);
  }
};

const resolve7zExecutables = async (): Promise<string[]> => {
  if (cached7zExecutables) {
    return cached7zExecutables;
  }

  const executables: string[] = [];
  if (path7za) {
    try {
      await ensureExecutablePermission(path7za);
      executables.push(path7za);
    } catch {
      // Fall back to system 7z binary.
    }
  }

  executables.unshift("7zz", "7z");
  executables.push("7za");
  cached7zExecutables = executables;
  return executables;
};

export const run7zaStream = async (args: string[], options: ArchiveOptions = {}): Promise<Readable> => {
  const commands = await resolve7zExecutables();
  for (let index = 0; index < commands.length; index += 1) {
    try { return await runChildStream(commands[index], args, options); }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if ((code !== "ENOENT" && code !== "EACCES") || index === commands.length - 1) throw error;
    }
  }
  throw new Error("未找到可用归档程序，请安装 7z");
};

const run7za = async (args: string[], options: ArchiveOptions = {}): Promise<{ stdout: Buffer }> => ({
  stdout: await collectBounded(await run7zaStream(args, options))
});

export const collect7zImageEntries = async (archivePath: string, options: ArchiveOptions = {}): Promise<ArchiveImageEntry[]> => {
  const { stdout } = await run7za(["l", "-slt", "-ba", archivePath], { ...options, maxBytes: Math.min(options.maxBytes ?? MAX_LISTING_BYTES, MAX_LISTING_BYTES) });
  const output = decode7zText(stdout);
  const blocks = output
    .split(/\r?\n\r?\n+/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  const entries: ArchiveImageEntry[] = [];
  if (blocks.length > (options.maxEntries ?? MAX_ARCHIVE_ENTRIES)) throw new Error("归档条目数超过上限");

  for (const block of blocks) {
    let entryPath = "";
    let encrypted = false;
    let isDirectory = false;
    let sizeBytes = 0;

    for (const line of block.split(/\r?\n/)) {
      const separatorIndex = line.indexOf(" = ");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 3).trim();

      if (key === "Path") {
        entryPath = normalizeArchiveEntryPath(value);
        continue;
      }

      if (key === "Encrypted") {
        encrypted = value === "+";
        continue;
      }

      if (key === "Folder") {
        isDirectory = value === "+";
        continue;
      }

      if (key === "Attributes" && value.startsWith("D")) {
        isDirectory = true;
        continue;
      }

      if (key === "Size") {
        const parsedSize = Number.parseInt(value, 10);
        sizeBytes = Number.isFinite(parsedSize) ? parsedSize : 0;
      }
    }

    if (!entryPath || entryPath.endsWith("/") || isDirectory || encrypted) {
      continue;
    }

    const extension = normalizeExtension(entryPath);
    if (!isSupportedImageExtension(extension)) {
      continue;
    }

    entries.push({
      entryPath,
      name: path.basename(entryPath),
      extension,
      sizeBytes
    });
  }

  return entries;
};

export const read7zBuffer = async (archivePath: string, entryPath: string, options: ArchiveOptions = {}): Promise<Buffer> => {
  const { stdout } = await run7za([
    "e",
    "-so",
    "-bd",
    "-y",
    archivePath,
    normalizeArchiveEntryPath(entryPath)
  ], options);
  return extractJpegFromPsd(stdout);
};

export const read7zStream = async (archivePath: string, entryPath: string, options: ArchiveOptions = {}): Promise<Readable> =>
  run7zaStream([
    "e",
    "-so",
    "-bd",
    "-y",
    archivePath,
    normalizeArchiveEntryPath(entryPath)
  ], options);
