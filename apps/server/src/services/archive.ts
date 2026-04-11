import fs from "node:fs";
import path from "node:path";
import yauzl from "yauzl";
import { createExtractorFromFile, createExtractorFromData } from "node-unrar-js";

import { isSupportedImageExtension } from "../lib/image-formats.js";
import { normalizeExtension, toPosixPath } from "../lib/paths.js";

const SUPPORTED_ARCHIVE_EXTENSIONS = new Set(["zip", "cbz", "cbr"]);

export type ArchiveImageEntry = {
  entryPath: string;
  name: string;
  extension: string;
  sizeBytes: number;
};

type ArchiveType = "zip" | "cbr";

const detectArchiveType = (filePath: string): ArchiveType | null => {
  const ext = normalizeExtension(filePath).toLowerCase();
  if (ext === "zip" || ext === "cbz") return "zip";
  if (ext === "cbr") return "cbr";
  return null;
};

type UnrarExtractor = Awaited<ReturnType<typeof createExtractorFromFile>>;
type UnrarDataExtractor = Awaited<ReturnType<typeof createExtractorFromData>>;

const openZip = async (zipPath: string): Promise<yauzl.ZipFile> =>
  new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (error, zipFile) => {
      if (error || !zipFile) {
        reject(error ?? new Error(`无法打开 ZIP 文件: ${zipPath}`));
        return;
      }

      resolve(zipFile);
    });
  });

const collectZipImageEntries = async (zipPath: string): Promise<ArchiveImageEntry[]> => {
  const zipFile = await openZip(zipPath);

  return new Promise((resolve, reject) => {
    const entries: ArchiveImageEntry[] = [];

    zipFile.readEntry();

    zipFile.on("entry", (entry) => {
      const entryPath = toPosixPath(entry.fileName);

      if (entryPath.endsWith("/")) {
        zipFile.readEntry();
        return;
      }

      const extension = normalizeExtension(entryPath);
      if (!isSupportedImageExtension(extension)) {
        zipFile.readEntry();
        return;
      }

      entries.push({
        entryPath,
        name: path.basename(entryPath),
        extension,
        sizeBytes: entry.uncompressedSize
      });

      zipFile.readEntry();
    });

    zipFile.once("end", () => {
      zipFile.close();
      resolve(entries);
    });

    zipFile.once("error", (error) => {
      zipFile.close();
      reject(error);
    });
  });
};

const collectCbrImageEntries = async (archivePath: string): Promise<ArchiveImageEntry[]> => {
  const buffer = await fs.promises.readFile(archivePath);

  let unrar: UnrarExtractor | UnrarDataExtractor;
  try {
    unrar = await createExtractorFromFile({ filepath: archivePath });
  } catch {
    unrar = await createExtractorFromData({ data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) });
  }

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

const collectAllImageEntries = async (archivePath: string): Promise<ArchiveImageEntry[]> => {
  const archiveType = detectArchiveType(archivePath);
  if (!archiveType) {
    throw new Error(`不支持的压缩包格式: ${archivePath}`);
  }

  if (archiveType === "zip") {
    return collectZipImageEntries(archivePath);
  }

  if (archiveType === "cbr") {
    return collectCbrImageEntries(archivePath);
  }

  throw new Error(`未实现的压缩包格式处理: ${archiveType}`);
};

export const listRootImageEntries = async (archivePath: string): Promise<ArchiveImageEntry[]> => {
  const entries = await collectAllImageEntries(archivePath);

  const rootImages = entries.filter((entry) => !entry.entryPath.includes("/"));
  if (rootImages.length > 0) {
    return rootImages;
  }

  const topFolders = Array.from(
    new Set(
      entries
        .filter((entry) => entry.entryPath.includes("/"))
        .map((entry) => entry.entryPath.split("/")[0])
    )
  );

  if (topFolders.length === 1) {
    return entries.filter((entry) => entry.entryPath.startsWith(`${topFolders[0]}/`));
  }

  return [];
};

const readZipBuffer = async (zipPath: string, entryPath: string): Promise<Buffer> => {
  const zipFile = await openZip(zipPath);

  return new Promise((resolve, reject) => {
    let found = false;

    zipFile.readEntry();

    zipFile.on("entry", (entry) => {
      const currentPath = toPosixPath(entry.fileName);
      if (currentPath !== entryPath) {
        zipFile.readEntry();
        return;
      }

      found = true;
      zipFile.openReadStream(entry, (error, stream) => {
        if (error || !stream) {
          zipFile.close();
          reject(error ?? new Error(`无法读取 ZIP 条目: ${entryPath}`));
          return;
        }

        const chunks: Buffer[] = [];
        stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on("end", () => {
          zipFile.close();
          resolve(Buffer.concat(chunks));
        });
        stream.on("error", (streamError) => {
          zipFile.close();
          reject(streamError);
        });
      });
    });

    zipFile.once("end", () => {
      if (!found) {
        zipFile.close();
        reject(new Error(`ZIP 条目不存在: ${entryPath}`));
      }
    });

    zipFile.once("error", (error) => {
      zipFile.close();
      reject(error);
    });
  });
};

const readCbrBuffer = async (archivePath: string, entryPath: string): Promise<Buffer> => {
  const buffer = await fs.promises.readFile(archivePath);

  let unrar: UnrarExtractor | UnrarDataExtractor;
  try {
    unrar = await createExtractorFromFile({ filepath: archivePath });
  } catch {
    unrar = await createExtractorFromData({ data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) });
  }

  const extracted = await unrar.extract({ files: [entryPath] });

  for (const file of extracted.files) {
    if (file.extraction) {
      return Buffer.from(file.extraction);
    }
  }

  throw new Error(`CBR 条目不存在: ${entryPath}`);
};

export const readArchiveEntryBuffer = async (archivePath: string, entryPath: string): Promise<Buffer> => {
  const archiveType = detectArchiveType(archivePath);
  if (!archiveType) {
    throw new Error(`不支持的压缩包格式: ${archivePath}`);
  }

  if (archiveType === "zip") {
    return readZipBuffer(archivePath, entryPath);
  }

  if (archiveType === "cbr") {
    return readCbrBuffer(archivePath, entryPath);
  }

  throw new Error(`未实现的压缩包格式读取: ${archiveType}`);
};

export const isArchiveFile = async (filePath: string): Promise<boolean> => {
  const stats = await fs.promises.stat(filePath);
  return stats.isFile() && SUPPORTED_ARCHIVE_EXTENSIONS.has(normalizeExtension(filePath));
};

export const isZipFile = isArchiveFile;
export const listZipRootImageEntries = listRootImageEntries;
export const readZipEntryBuffer = readArchiveEntryBuffer;
