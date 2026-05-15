import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { Readable } from "node:stream";

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

export const run7zaStream = async (args: string[]): Promise<Readable> =>
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

export const collect7zImageEntries = async (archivePath: string): Promise<ArchiveImageEntry[]> => {
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

export const read7zBuffer = async (archivePath: string, entryPath: string): Promise<Buffer> => {
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

export const read7zStream = async (archivePath: string, entryPath: string): Promise<Readable> =>
  run7zaStream([
    "e",
    "-so",
    "-bd",
    "-y",
    archivePath,
    normalizeArchiveEntryPath(entryPath)
  ]);
