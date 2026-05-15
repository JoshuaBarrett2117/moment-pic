import type { Readable } from "node:stream";
import type fs from "node:fs";

import { detectArchiveType, SUPPORTED_ARCHIVE_EXTENSIONS } from "./archive-utils.js";
import { normalizeExtension } from "../lib/paths.js";
import { toArchiveBody } from "./archive/archive-body.js";
import { collectCbrImageEntries, readCbrBuffer, readCbrStream } from "./archive/cbr-reader.js";
import { collect7zImageEntries, read7zBuffer, read7zStream } from "./archive/sevenzip-reader.js";
import type { ArchiveImageEntry } from "./archive/archive-types.js";
import { collectZipImageEntries, readZipBuffer, readZipStream } from "./archive/zip-reader.js";

export { detectArchiveType } from "./archive-utils.js";
export type { ArchiveImageEntry } from "./archive/archive-types.js";

export const isArchiveFile = async (filePath: string, stats?: fs.Stats): Promise<boolean> => {
  if (stats && !stats.isFile()) {
    return false;
  }

  return SUPPORTED_ARCHIVE_EXTENSIONS.has(normalizeExtension(filePath));
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
    return toArchiveBody(read7zStream(archivePath, entryPath));
  }

  throw new Error(`archive format stream reader is not implemented: ${archiveType}`);
};
