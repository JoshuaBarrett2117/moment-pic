import path from "node:path";
import type { Readable } from "node:stream";

import { createExtractorFromFile } from "node-unrar-js";

import { isSupportedImageExtension } from "../../lib/image-formats.js";
import { normalizeExtension, toPosixPath } from "../../lib/paths.js";
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
  return read7zBuffer(archivePath, entryPath);
};

export const readCbrStream = async (archivePath: string, entryPath: string): Promise<Readable> => {
  return read7zStream(archivePath, entryPath);
};
