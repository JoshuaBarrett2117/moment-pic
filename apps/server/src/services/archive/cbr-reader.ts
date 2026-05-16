import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";

import { createExtractorFromFile } from "node-unrar-js";

import { isSupportedImageExtension } from "../../lib/image-formats.js";
import { normalizeExtension, toPosixPath } from "../../lib/paths.js";
import { normalizeArchiveEntryPath } from "../archive-utils.js";
import { createSingleRun } from "./archive-body.js";
import { read7zBuffer, read7zStream } from "./sevenzip-reader.js";
import type { ArchiveImageEntry } from "./archive-types.js";

type UnrarExtractor = Awaited<ReturnType<typeof createExtractorFromFile>>;

const openUnrarFileExtractor = async (archivePath: string): Promise<UnrarExtractor> => {
  try {
    return await createExtractorFromFile({ filepath: archivePath });
  } catch {
    throw new Error(`cannot open RAR archive: ${archivePath}`);
  }
};

const isRarFile = (archivePath: string): boolean => normalizeExtension(archivePath) === "rar";

const extractCbrEntryToTempFile = async (archivePath: string, entryPath: string): Promise<{
  tempDir: string;
  filePath: string;
}> => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "moment-pic-rar-entry-"));
  const normalizedEntryPath = normalizeArchiveEntryPath(entryPath);
  const targetName = `entry${path.extname(normalizedEntryPath) || ".bin"}`;
  const targetPath = path.join(tempDir, targetName);

  try {
    const unrar = await createExtractorFromFile({
      filepath: archivePath,
      targetPath: tempDir,
      filenameTransform: () => targetName
    });
    const extracted = unrar.extract({ files: [normalizedEntryPath] });
    for (const _file of extracted.files) {
      // 必须完整遍历迭代器，node-unrar-js 才会释放底层解压对象。
    }

    const stat = await fs.promises.stat(targetPath);
    if (!stat.isFile() || stat.size <= 0) {
      throw new Error(`RAR entry produced empty output: ${normalizedEntryPath}`);
    }

    return {
      tempDir,
      filePath: targetPath
    };
  } catch (error) {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
};

const readUnrarEntryBuffer = async (archivePath: string, entryPath: string): Promise<Buffer> => {
  const extracted = await extractCbrEntryToTempFile(archivePath, entryPath);
  try {
    return await fs.promises.readFile(extracted.filePath);
  } finally {
    await fs.promises.rm(extracted.tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
};

const openUnrarEntryStream = async (archivePath: string, entryPath: string): Promise<Readable> => {
  const extracted = await extractCbrEntryToTempFile(archivePath, entryPath);
  const stream = fs.createReadStream(extracted.filePath);
  const cleanup = createSingleRun(() => {
    fs.promises.rm(extracted.tempDir, { recursive: true, force: true }).catch(() => undefined);
  });

  stream.once("close", cleanup);
  stream.once("error", cleanup);
  return stream;
};

export const collectCbrImageEntries = async (archivePath: string): Promise<ArchiveImageEntry[]> => {
  const unrar = await openUnrarFileExtractor(archivePath);
  const fileHeaders = [...unrar.getFileList().fileHeaders];
  const entries: ArchiveImageEntry[] = [];

  for (const header of fileHeaders) {
    if (header.flags.encrypted) {
      continue;
    }

    const entryPath = toPosixPath(header.name);
    if (entryPath.endsWith("/")) {
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
      sizeBytes: header.unpSize
    });
  }

  return entries;
};

export const readCbrBuffer = async (archivePath: string, entryPath: string): Promise<Buffer> => {
  if (isRarFile(archivePath)) {
    return readUnrarEntryBuffer(archivePath, entryPath);
  }

  return read7zBuffer(archivePath, entryPath);
};

export const readCbrStream = async (archivePath: string, entryPath: string): Promise<Readable> => {
  if (isRarFile(archivePath)) {
    return openUnrarEntryStream(archivePath, entryPath);
  }

  return read7zStream(archivePath, entryPath);
};
