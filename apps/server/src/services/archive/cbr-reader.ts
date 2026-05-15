import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";

import { createExtractorFromFile } from "node-unrar-js";

import { isSupportedImageExtension } from "../../lib/image-formats.js";
import { normalizeExtension, toPosixPath } from "../../lib/paths.js";
import { extractJpegFromPsd } from "../archive-utils.js";
import { createSingleRun } from "./archive-body.js";
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
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "moment-pic-unrar-"));
  try {
    const unrar = await createExtractorFromFile({ filepath: archivePath, targetPath: tempDir });
    const extracted = await unrar.extract({ files: [entryPath] });

    for (const file of extracted.files) {
      const extractedPath = path.join(tempDir, file.fileHeader.name);
      const extractedBuffer = await fs.promises.readFile(extractedPath);
      return extractJpegFromPsd(extractedBuffer);
    }

    throw new Error(`CBR entry not found: ${entryPath}`);
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
};

export const readCbrStream = async (archivePath: string, entryPath: string): Promise<Readable> => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "moment-pic-unrar-"));
  try {
    const unrar = await createExtractorFromFile({ filepath: archivePath, targetPath: tempDir });
    const extracted = await unrar.extract({ files: [entryPath] });

    for (const file of extracted.files) {
      const extractedPath = path.join(tempDir, file.fileHeader.name);
      const stream = fs.createReadStream(extractedPath);
      const cleanup = createSingleRun(() => {
        void fs.promises.rm(tempDir, { recursive: true, force: true });
      });
      stream.once("error", cleanup);
      stream.once("end", cleanup);
      stream.once("close", cleanup);
      return stream;
    }

    await fs.promises.rm(tempDir, { recursive: true, force: true });
    throw new Error(`CBR entry not found: ${entryPath}`);
  } catch (error) {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
    throw error;
  }
};
