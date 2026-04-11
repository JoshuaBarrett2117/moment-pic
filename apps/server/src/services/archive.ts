import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import yauzl from "yauzl";
import { createExtractorFromFile, createExtractorFromData } from "node-unrar-js";
import { path7za } from "7zip-bin";

import { isSupportedImageExtension } from "../lib/image-formats.js";
import { normalizeExtension, toPosixPath } from "../lib/paths.js";

const SUPPORTED_ARCHIVE_EXTENSIONS = new Set(["zip", "cbz", "cbr", "7z"]);

export type ArchiveImageEntry = {
  entryPath: string;
  name: string;
  extension: string;
  sizeBytes: number;
};

type ArchiveType = "zip" | "cbr" | "7z";

const detectArchiveType = (filePath: string): ArchiveType | null => {
  const ext = normalizeExtension(filePath).toLowerCase();
  if (ext === "zip" || ext === "cbz") return "zip";
  if (ext === "cbr") return "cbr";
  if (ext === "7z") return "7z";
  return null;
};

type UnrarExtractor = Awaited<ReturnType<typeof createExtractorFromFile>>;
type UnrarDataExtractor = Awaited<ReturnType<typeof createExtractorFromData>>;

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

const normalizeArchiveEntryPath = (entryPath: string): string =>
  toPosixPath(entryPath).replace(/\\/g, "/");

const openZip = async (zipPath: string): Promise<yauzl.ZipFile> =>
  new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (error, zipFile) => {
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
          reject(error ?? new Error(`cannot read ZIP entry: ${entryPath}`));
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
        reject(new Error(`ZIP entry not found: ${entryPath}`));
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

  throw new Error(`CBR entry not found: ${entryPath}`);
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
  return stdout;
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

export const isArchiveFile = async (filePath: string): Promise<boolean> => {
  const stats = await fs.promises.stat(filePath);
  return stats.isFile() && SUPPORTED_ARCHIVE_EXTENSIONS.has(normalizeExtension(filePath));
};

export const isZipFile = isArchiveFile;
export const listZipRootImageEntries = listRootImageEntries;
export const readZipEntryBuffer = readArchiveEntryBuffer;
