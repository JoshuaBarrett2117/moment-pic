import path from "node:path";
import type { Readable } from "node:stream";

import yauzl from "yauzl";

import { isSupportedImageExtension } from "../../lib/image-formats.js";
import { normalizeExtension, toPosixPath } from "../../lib/paths.js";
import { extractJpegFromPsd } from "../archive-utils.js";
import { createSingleRun } from "./archive-body.js";
import type { ArchiveImageEntry } from "./archive-types.js";

type ZipEntryName = string | Buffer;

const ZIP_UTF8_FLAG = 0x800;

const decodeZipText = (buffer: Buffer, forceUtf8: boolean): string => {
  if (forceUtf8) {
    return buffer.toString("utf8");
  }

  const utf8 = buffer.toString("utf8");
  if (process.platform !== "win32") {
    return utf8;
  }

  try {
    const gbk = new TextDecoder("gbk").decode(buffer);
    const utf8ReplacementCount = (utf8.match(/\uFFFD/g) ?? []).length;
    const gbkReplacementCount = (gbk.match(/\uFFFD/g) ?? []).length;
    if (gbkReplacementCount < utf8ReplacementCount) {
      return gbk;
    }
    if (gbkReplacementCount === utf8ReplacementCount && gbk.length >= utf8.length) {
      return gbk;
    }
  } catch {
    return utf8;
  }

  return utf8;
};

const toDecodedZipEntryPath = (entry: yauzl.Entry): string => {
  const rawName = entry.fileName as ZipEntryName;
  const nameBuffer = Buffer.isBuffer(rawName) ? rawName : Buffer.from(rawName, "utf8");
  const isUtf8 = (entry.generalPurposeBitFlag & ZIP_UTF8_FLAG) === ZIP_UTF8_FLAG;
  const decoded = decodeZipText(nameBuffer, isUtf8);
  return toPosixPath(decoded);
};

const closeZipFileQuietly = (zipFile: yauzl.ZipFile) => {
  try {
    zipFile.close();
  } catch {
    // no-op
  }
};

const openZip = async (zipPath: string): Promise<yauzl.ZipFile> =>
  new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, decodeStrings: false }, (error, zipFile) => {
      if (error || !zipFile) {
        reject(error ?? new Error(`cannot open ZIP archive: ${zipPath}`));
        return;
      }

      resolve(zipFile);
    });
  });

export const collectZipImageEntries = async (zipPath: string): Promise<ArchiveImageEntry[]> => {
  const zipFile = await openZip(zipPath);

  return new Promise((resolve, reject) => {
    const entries: ArchiveImageEntry[] = [];

    zipFile.readEntry();

    zipFile.on("entry", (entry) => {
      const entryPath = toDecodedZipEntryPath(entry);

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

export const readZipBuffer = async (zipPath: string, entryPath: string): Promise<Buffer> => {
  const zipFile = await openZip(zipPath);

  return new Promise((resolve, reject) => {
    let found = false;

    zipFile.readEntry();

    zipFile.on("entry", (entry) => {
      const currentPath = toDecodedZipEntryPath(entry);
      if (currentPath !== entryPath) {
        zipFile.readEntry();
        return;
      }

      found = true;
      zipFile.openReadStream(entry, (error, stream) => {
        if (error || !stream) {
          zipFile.close();
          reject(error ?? new Error(`cannot read ZIP entry: ${entryPath}`));
          return;
        }

        const chunks: Buffer[] = [];
        stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on("end", () => {
          zipFile.close();
          resolve(extractJpegFromPsd(Buffer.concat(chunks)));
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
        reject(new Error(`ZIP entry not found: ${entryPath}`));
      }
    });

    zipFile.once("error", (error) => {
      zipFile.close();
      reject(error);
    });
  });
};

export const readZipStream = async (zipPath: string, entryPath: string): Promise<Readable> => {
  const zipFile = await openZip(zipPath);

  return new Promise((resolve, reject) => {
    let found = false;
    let settled = false;

    const rejectWithCleanup = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      closeZipFileQuietly(zipFile);
      reject(error);
    };

    zipFile.readEntry();

    zipFile.on("entry", (entry) => {
      if (settled) {
        return;
      }

      const currentPath = toDecodedZipEntryPath(entry);
      if (currentPath !== entryPath) {
        zipFile.readEntry();
        return;
      }

      found = true;
      zipFile.openReadStream(entry, (error, stream) => {
        if (error || !stream) {
          rejectWithCleanup(error ?? new Error(`cannot read ZIP entry: ${entryPath}`));
          return;
        }

        settled = true;
        const closeZip = createSingleRun(() => closeZipFileQuietly(zipFile));
        stream.once("error", closeZip);
        stream.once("end", closeZip);
        stream.once("close", closeZip);
        resolve(stream);
      });
    });

    zipFile.once("end", () => {
      if (!found) {
        rejectWithCleanup(new Error(`ZIP entry not found: ${entryPath}`));
      }
    });

    zipFile.once("error", (error) => {
      rejectWithCleanup(error);
    });
  });
};
