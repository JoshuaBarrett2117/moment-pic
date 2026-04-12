export type SourceType = "folder" | "zip";

export type LibraryRootRecord = {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  lastScannedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AlbumRecord = {
  id: string;
  libraryRootId: string;
  name: string;
  sourceType: SourceType;
  sourcePath: string;
  sourceMtime: string | null;
  assetsFingerprint: string | null;
  coverAssetId: string | null;
  assetCount: number;
  scanStatus: "ready" | "error";
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssetRecord = {
  id: string;
  albumId: string;
  name: string;
  extension: string;
  sourceType: SourceType;
  sourcePath: string;
  relativePath: string | null;
  zipEntryPath: string | null;
  sortIndex: number;
  width: number | null;
  height: number | null;
  sizeBytes: string | null;
  sourceMtime: string | null;
  thumbnailKey: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ThumbnailRecord = {
  id: string;
  assetId: string;
  cacheKey: string;
  format: string;
  width: number;
  height: number;
  filePath: string;
  status: "ready" | "stale" | "error";
  createdAt: string;
  updatedAt: string;
};

export type IndexStore = {
  libraryRoots: LibraryRootRecord[];
  albums: AlbumRecord[];
  assets: AssetRecord[];
  thumbnails: ThumbnailRecord[];
};
