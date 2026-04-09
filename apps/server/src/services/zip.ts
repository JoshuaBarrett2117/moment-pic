import fs from "node:fs";
import path from "node:path";
import yauzl from "yauzl";

import { isSupportedImageExtension } from "../lib/image-formats.js";
import { normalizeExtension, toPosixPath } from "../lib/paths.js";

export type ZipImageEntry = {
  entryPath: string;
  name: string;
  extension: string;
  sizeBytes: number;
};

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

const collectAllImageEntries = async (zipPath: string): Promise<ZipImageEntry[]> => {
  const zipFile = await openZip(zipPath);

  return new Promise((resolve, reject) => {
    const entries: ZipImageEntry[] = [];

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

export const listRootImageEntries = async (zipPath: string): Promise<ZipImageEntry[]> => {
  const entries = await collectAllImageEntries(zipPath);

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

export const readZipEntryBuffer = async (zipPath: string, entryPath: string): Promise<Buffer> => {
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

export const isZipFile = async (filePath: string): Promise<boolean> => {
  const stats = await fs.promises.stat(filePath);
  return stats.isFile() && normalizeExtension(filePath) === "zip";
};
