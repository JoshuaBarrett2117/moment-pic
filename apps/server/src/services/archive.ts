import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { PassThrough, type Readable } from "node:stream";
import yauzl from "yauzl";
import { createExtractorFromFile } from "node-unrar-js";
import { path7za } from "7zip-bin";

import { isSupportedImageExtension } from "../lib/image-formats.js";
import { normalizeExtension, toPosixPath } from "../lib/paths.js";
import { detectArchiveType, extractJpegFromPsd, normalizeArchiveEntryPath, PSD_MAGIC, SUPPORTED_ARCHIVE_EXTENSIONS } from "./archive-utils.js";

export { detectArchiveType } from "./archive-utils.js";

export type ArchiveImageEntry = {
  entryPath: string;
  name: string;
  extension: string;
  sizeBytes: number;
};

type ZipEntryName = string | Buffer;
type UnrarExtractor = Awaited<ReturnType<typeof createExtractorFromFile>>;

const ZIP_UTF8_FLAG = 0x800;

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

  executables.push("7za", "7z");
  cached7zExecutables = executables;
  return executables;
};

const run7za = async (
  args: string[]
): Promise<{ stdout: Buffer; stderr: string }> =>
  new Promise(async (resolve, reject) => {
    const commands = await resolve7zExecutables();
    const unavailableErrors: Error[] = [];

    const runWithCommand = (command: string, index: number) => {
      const child = spawn(command, args, {
        windowsHide: true
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout.on("data", (chunk) => {
        stdoutChunks.push(Buffer.from(chunk));
      });

      child.stderr.on("data", (chunk) => {
        stderrChunks.push(Buffer.from(chunk));
      });

      child.once("error", (error) => {
        const errorCode = (error as NodeJS.ErrnoException).code;
        if ((errorCode === "EACCES" || errorCode === "ENOENT") && index < commands.length - 1) {
          unavailableErrors.push(new Error(`${command}: ${error.message}`));
          runWithCommand(commands[index + 1], index + 1);
          return;
        }

        if ((errorCode === "EACCES" || errorCode === "ENOENT") && unavailableErrors.length > 0) {
          reject(
            new Error(
              `no usable 7z executable. tried: ${[
                ...unavailableErrors.map((item) => item.message),
                `${command}: ${error.message}`
              ].join(" | ")}`
            )
          );
          return;
        }

        reject(error);
      });

      child.once("close", (code) => {
        const stdout = Buffer.concat(stdoutChunks);
        const stderr = decode7zText(Buffer.concat(stderrChunks));
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }

        reject(
          new Error(
            `7z command failed via "${command}" (code ${code}): ${stderr || args.join(" ")}`
          )
        );
      });
    };

    runWithCommand(commands[0], 0);
  });

const createSingleRun = (fn: () => void) => {
  let called = false;
  return () => {
    if (called) {
      return;
    }
    called = true;
    fn();
  };
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

const collectZipImageEntries = async (zipPath: string): Promise<ArchiveImageEntry[]> => {
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

const openUnrarFileExtractor = async (archivePath: string): Promise<UnrarExtractor> => {
  try {
    return await createExtractorFromFile({ filepath: archivePath });
  } catch {
    throw new Error(`cannot open RAR archive: ${archivePath}`);
  }
};

const collectCbrImageEntriesWithUnrar = async (archivePath: string): Promise<ArchiveImageEntry[]> => {
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

const collectCbrImageEntries = async (archivePath: string): Promise<ArchiveImageEntry[]> => {
  return collectCbrImageEntriesWithUnrar(archivePath);
};

const collect7zImageEntries = async (archivePath: string): Promise<ArchiveImageEntry[]> => {
  const { stdout } = await run7za(["l", "-slt", "-ba", archivePath]);
  const output = decode7zText(stdout);
  const blocks = output
    .split(/\r?\n\r?\n+/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  const entries: ArchiveImageEntry[] = [];

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

const collectAllImageEntries = async (archivePath: string): Promise<ArchiveImageEntry[]> => {
  const archiveType = detectArchiveType(archivePath);
  if (!archiveType) {
    throw new Error(`unsupported archive format: ${archivePath}`);
  }

  if (archiveType === "zip") {
    return collectZipImageEntries(archivePath);
  }

  if (archiveType === "cbr") {
    return collectCbrImageEntries(archivePath);
  }

  if (archiveType === "7z") {
    return collect7zImageEntries(archivePath);
  }

  throw new Error(`archive format handler is not implemented: ${archiveType}`);
};

export const listRootImageEntries = async (archivePath: string): Promise<ArchiveImageEntry[]> => {
  const entries = await collectAllImageEntries(archivePath);

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

const readZipBuffer = async (zipPath: string, entryPath: string): Promise<Buffer> => {
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
          const buffer = Buffer.concat(chunks);
          const extractedJpeg = extractJpegFromPsd(buffer);
          resolve(extractedJpeg);
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

const closeZipFileQuietly = (zipFile: yauzl.ZipFile) => {
  try {
    zipFile.close();
  } catch {
    // no-op
  }
};

const readZipStream = async (zipPath: string, entryPath: string): Promise<Readable> => {
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

const readCbrBuffer = async (archivePath: string, entryPath: string): Promise<Buffer> => {
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

const readCbrStream = async (archivePath: string, entryPath: string): Promise<Readable> => {
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

const read7zBuffer = async (archivePath: string, entryPath: string): Promise<Buffer> => {
  const { stdout } = await run7za([
    "e",
    "-so",
    "-bd",
    "-y",
    archivePath,
    normalizeArchiveEntryPath(entryPath)
  ]);
  return extractJpegFromPsd(stdout);
};

const run7zaStream = async (args: string[]): Promise<Readable> =>
  new Promise(async (resolve, reject) => {
    const commands = await resolve7zExecutables();
    const unavailableErrors: Error[] = [];

    const runWithCommand = (command: string, index: number) => {
      const child = spawn(command, args, {
        windowsHide: true
      });

      const stdout = child.stdout;
      const stderrChunks: Buffer[] = [];
      let settled = false;

      child.stderr.on("data", (chunk) => {
        stderrChunks.push(Buffer.from(chunk));
      });

      child.once("error", (error) => {
        const errorCode = (error as NodeJS.ErrnoException).code;
        if ((errorCode === "EACCES" || errorCode === "ENOENT") && index < commands.length - 1) {
          unavailableErrors.push(new Error(`${command}: ${error.message}`));
          runWithCommand(commands[index + 1], index + 1);
          return;
        }

        if ((errorCode === "EACCES" || errorCode === "ENOENT") && unavailableErrors.length > 0) {
          reject(
            new Error(
              `no usable 7z executable. tried: ${[
                ...unavailableErrors.map((item) => item.message),
                `${command}: ${error.message}`
              ].join(" | ")}`
            )
          );
          return;
        }

        reject(error);
      });

      child.once("spawn", () => {
        if (!stdout) {
          reject(new Error(`7z command failed via "${command}": stdout unavailable`));
          return;
        }

        settled = true;
        child.once("close", (code) => {
          if (code === 0) {
            return;
          }

          const stderr = decode7zText(Buffer.concat(stderrChunks));
          stdout.destroy(
            new Error(`7z command failed via "${command}" (code ${code}): ${stderr || args.join(" ")}`)
          );
        });

        resolve(stdout);
      });

      child.once("close", (code) => {
        if (!settled && code !== 0) {
          const stderr = decode7zText(Buffer.concat(stderrChunks));
          reject(new Error(`7z command failed via "${command}" (code ${code}): ${stderr || args.join(" ")}`));
        }
      });
    };

    runWithCommand(commands[0], 0);
  });

const toArchiveBody = async (streamPromise: Promise<Readable>): Promise<Readable | Buffer> => {
  const stream = await streamPromise;

  return new Promise((resolve, reject) => {
    const headChunks: Buffer[] = [];
    let headLength = 0;
    let resolved = false;

    const cleanupHeadListeners = () => {
      stream.off("data", onData);
      stream.off("end", onEnd);
      stream.off("error", onError);
    };

    const resolveWith = (body: Readable | Buffer) => {
      if (resolved) {
        return;
      }
      resolved = true;
      cleanupHeadListeners();
      resolve(body);
    };

    const rejectWith = (error: Error) => {
      if (resolved) {
        return;
      }
      resolved = true;
      cleanupHeadListeners();
      reject(error);
    };

    const onError = (error: Error) => {
      rejectWith(error);
    };

    const onEnd = () => {
      resolveWith(Buffer.concat(headChunks));
    };

    const onData = (chunk: Buffer | string) => {
      const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      headChunks.push(bufferChunk);
      headLength += bufferChunk.length;

      if (headLength < 4) {
        return;
      }

      const headBuffer = Buffer.concat(headChunks);
      cleanupHeadListeners();
      if (headBuffer.subarray(0, 4).equals(PSD_MAGIC)) {
        const remainingChunks = [headBuffer];
        stream.on("data", (data) => {
          remainingChunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
        });
        stream.once("end", () => {
          resolveWith(extractJpegFromPsd(Buffer.concat(remainingChunks)));
        });
        stream.once("error", onError);
        return;
      }

      const output = new PassThrough();
      output.write(headBuffer);
      stream.pipe(output);
      resolveWith(output);
    };

    stream.on("data", onData);
    stream.once("end", onEnd);
    stream.once("error", onError);
  });
};

export const readArchiveEntryBuffer = async (archivePath: string, entryPath: string): Promise<Buffer> => {
  const archiveType = detectArchiveType(archivePath);
  if (!archiveType) {
    throw new Error(`unsupported archive format: ${archivePath}`);
  }

  if (archiveType === "zip") {
    return readZipBuffer(archivePath, entryPath);
  }

  if (archiveType === "cbr") {
    return readCbrBuffer(archivePath, entryPath);
  }

  if (archiveType === "7z") {
    return read7zBuffer(archivePath, entryPath);
  }

  throw new Error(`archive format reader is not implemented: ${archiveType}`);
};

export const openArchiveEntryBody = async (archivePath: string, entryPath: string): Promise<Readable | Buffer> => {
  const archiveType = detectArchiveType(archivePath);
  if (!archiveType) {
    throw new Error(`unsupported archive format: ${archivePath}`);
  }

  if (archiveType === "zip") {
    return toArchiveBody(readZipStream(archivePath, entryPath));
  }

  if (archiveType === "cbr") {
    return toArchiveBody(readCbrStream(archivePath, entryPath));
  }

  if (archiveType === "7z") {
    return toArchiveBody(run7zaStream([
      "e",
      "-so",
      "-bd",
      "-y",
      archivePath,
      normalizeArchiveEntryPath(entryPath)
    ]));
  }

  throw new Error(`archive format reader is not implemented: ${archiveType}`);
};

export const isArchiveFile = async (filePath: string, stats?: fs.Stats): Promise<boolean> => {
  const targetStats = stats ?? (await fs.promises.stat(filePath));
  return targetStats.isFile() && SUPPORTED_ARCHIVE_EXTENSIONS.has(normalizeExtension(filePath));
};

export const isZipFile = isArchiveFile;
export const listZipRootImageEntries = listRootImageEntries;
export const readZipEntryBuffer = readArchiveEntryBuffer;
