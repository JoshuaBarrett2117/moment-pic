import fs from "node:fs";
import path from "node:path";

import { isSupportedImageExtension } from "../lib/image-formats.js";
import { normalizeExtension } from "../lib/paths.js";
import { listAlbumsByLibraryRootIdDb } from "../repositories/album-repository.js";
import { findLibraryRootByIdDb, listLibraryRootsDb } from "../repositories/library-root-repository.js";
import type { DirectoryAlbumNodeDTO, DirectoryAlbumsDTO } from "../types/dto.js";
import type { AlbumRecord, LibraryRootRecord } from "../types/store.js";
import { isArchiveFile } from "./archive.js";

export class DirectoryAlbumRootNotFoundError extends Error {
  constructor(rootId: string) {
    super(`directory album root not found: ${rootId}`);
    this.name = "DirectoryAlbumRootNotFoundError";
  }
}

export class DirectoryAlbumPathInvalidError extends Error {
  constructor(relativePath: string) {
    super(`directory album path invalid: ${relativePath}`);
    this.name = "DirectoryAlbumPathInvalidError";
  }
}

const sortNames = (left: string, right: string): number =>
  left.localeCompare(right, "zh-Hans-CN-u-kn-true");

const toPathKey = (targetPath: string): string => path.resolve(targetPath);

const normalizeRelativePath = (input?: string): string => {
  if (!input?.trim()) {
    return "";
  }

  const normalized = path.normalize(input.trim());
  if (path.isAbsolute(normalized) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    throw new DirectoryAlbumPathInvalidError(input);
  }

  return normalized === "." ? "" : normalized;
};

const resolveDirectoryPath = async (root: LibraryRootRecord, relativePath: string): Promise<string> => {
  const rootPath = path.resolve(root.path);
  const targetPath = path.resolve(rootPath, relativePath);
  if (targetPath !== rootPath && !targetPath.startsWith(`${rootPath}${path.sep}`)) {
    throw new DirectoryAlbumPathInvalidError(relativePath);
  }

  let stats: fs.Stats;
  try {
    stats = await fs.promises.stat(targetPath);
  } catch {
    throw new DirectoryAlbumPathInvalidError(relativePath);
  }
  if (!stats.isDirectory()) {
    throw new DirectoryAlbumPathInvalidError(relativePath);
  }

  return targetPath;
};

const toRelativePath = (root: LibraryRootRecord, targetPath: string): string =>
  path.relative(path.resolve(root.path), path.resolve(targetPath));

const toAlbumNode = (root: LibraryRootRecord, album: AlbumRecord): DirectoryAlbumNodeDTO => ({
  id: `album:${album.id}`,
  name: album.name,
  kind: "album",
  libraryRootId: root.id,
  relativePath: toRelativePath(root, album.sourcePath),
  albumId: album.id,
  sourceType: album.sourceType,
  assetCount: album.assetCount,
  coverUrl: album.coverAssetId ? `/api/v1/assets/${album.coverAssetId}/thumbnail` : null,
  updatedAt: album.updatedAt,
  childCount: 0
});

const hasRootImageFile = async (directoryPath: string): Promise<boolean> => {
  const entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });
  return entries.some((entry) => entry.isFile() && isSupportedImageExtension(normalizeExtension(entry.name)));
};

const countVisibleChildren = async (
  root: LibraryRootRecord,
  directoryPath: string,
  albumBySourcePath: Map<string, AlbumRecord>
): Promise<number> => {
  const entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });
  let count = 0;

  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      count += 1;
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const stats = await fs.promises.stat(fullPath);
    if (albumBySourcePath.has(toPathKey(fullPath)) || await isArchiveFile(fullPath, stats)) {
      count += 1;
    }
  }

  if (directoryPath === path.resolve(root.path) && count === 0 && await hasRootImageFile(directoryPath)) {
    return 1;
  }

  return count;
};

const safeCountVisibleChildren = async (
  root: LibraryRootRecord,
  directoryPath: string,
  albumBySourcePath: Map<string, AlbumRecord>
): Promise<number> => {
  try {
    return await countVisibleChildren(root, directoryPath, albumBySourcePath);
  } catch {
    return 0;
  }
};

const buildBreadcrumbs = (root: LibraryRootRecord, relativePath: string) => {
  const breadcrumbs = [
    { name: "目录相册", libraryRootId: null, relativePath: "" },
    { name: root.name, libraryRootId: root.id, relativePath: "" }
  ];

  if (!relativePath) {
    return breadcrumbs;
  }

  const segments = relativePath.split(path.sep).filter(Boolean);
  let current = "";
  for (const segment of segments) {
    current = current ? path.join(current, segment) : segment;
    breadcrumbs.push({
      name: segment,
      libraryRootId: root.id,
      relativePath: current
    });
  }

  return breadcrumbs;
};

export const listDirectoryAlbumNodesFromRecords = async (
  root: LibraryRootRecord,
  directoryPath: string,
  albums: AlbumRecord[]
): Promise<DirectoryAlbumNodeDTO[]> => {
  const albumBySourcePath = new Map(albums.map((album) => [toPathKey(album.sourcePath), album]));
  const entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });
  const nodes: DirectoryAlbumNodeDTO[] = [];

  for (const entry of entries.sort((left, right) => sortNames(left.name, right.name))) {
    const fullPath = path.join(directoryPath, entry.name);
    const album = albumBySourcePath.get(toPathKey(fullPath));
    if (album) {
      nodes.push(toAlbumNode(root, album));
      continue;
    }

    if (entry.isDirectory()) {
      nodes.push({
        id: `directory:${root.id}:${toRelativePath(root, fullPath)}`,
        name: entry.name,
        kind: "directory",
        libraryRootId: root.id,
        relativePath: toRelativePath(root, fullPath),
        albumId: null,
        sourceType: null,
        assetCount: 0,
        coverUrl: null,
        updatedAt: null,
        childCount: await safeCountVisibleChildren(root, fullPath, albumBySourcePath)
      });
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const stats = await fs.promises.stat(fullPath);
    if (!await isArchiveFile(fullPath, stats)) {
      continue;
    }
  }

  return nodes;
};

export const listDirectoryAlbums = async (input?: {
  libraryRootId?: string;
  relativePath?: string;
}): Promise<DirectoryAlbumsDTO> => {
  if (!input?.libraryRootId) {
    const roots = listLibraryRootsDb().filter((root) => root.enabled);
    const items = await Promise.all(roots.map(async (root): Promise<DirectoryAlbumNodeDTO> => {
      const albums = listAlbumsByLibraryRootIdDb(root.id);
      const albumBySourcePath = new Map(albums.map((album) => [toPathKey(album.sourcePath), album]));
      return {
        id: `directory:${root.id}:`,
        name: root.name,
        kind: "directory",
        libraryRootId: root.id,
        relativePath: "",
        albumId: null,
        sourceType: null,
        assetCount: albums.reduce((sum, album) => sum + album.assetCount, 0),
        coverUrl: null,
        updatedAt: root.lastScannedAt,
        childCount: await safeCountVisibleChildren(root, path.resolve(root.path), albumBySourcePath)
      };
    }));

    return {
      current: {
        name: "目录相册",
        libraryRootId: null,
        relativePath: ""
      },
      breadcrumbs: [{ name: "目录相册", libraryRootId: null, relativePath: "" }],
      items: items.sort((left, right) => sortNames(left.name, right.name))
    };
  }

  const root = findLibraryRootByIdDb(input.libraryRootId);
  if (!root || !root.enabled) {
    throw new DirectoryAlbumRootNotFoundError(input.libraryRootId);
  }

  const relativePath = normalizeRelativePath(input.relativePath);
  const directoryPath = await resolveDirectoryPath(root, relativePath);
  const albums = listAlbumsByLibraryRootIdDb(root.id);

  return {
    current: {
      name: relativePath ? path.basename(directoryPath) : root.name,
      libraryRootId: root.id,
      relativePath
    },
    breadcrumbs: buildBreadcrumbs(root, relativePath),
    items: await listDirectoryAlbumNodesFromRecords(root, directoryPath, albums)
  };
};
