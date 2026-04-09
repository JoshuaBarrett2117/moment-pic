export type SourceTypeDTO = "folder" | "zip";

export type PaginationDTO = {
  page: number;
  pageSize: number;
  total: number;
};

export type LibraryRootDTO = {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  lastScannedAt: string | null;
};

export type AlbumListItemDTO = {
  id: string;
  name: string;
  sourceType: SourceTypeDTO;
  assetCount: number;
  coverUrl: string | null;
  updatedAt: string;
};

export type AlbumDetailDTO = {
  id: string;
  name: string;
  sourceType: SourceTypeDTO;
  assetCount: number;
  coverAssetId: string | null;
  updatedAt: string;
};

export type AssetListItemDTO = {
  id: string;
  name: string;
  extension: string;
  width: number | null;
  height: number | null;
  sortIndex: number;
  thumbnailUrl: string;
  originalUrl: string;
};

export type AssetDetailDTO = {
  id: string;
  albumId: string;
  name: string;
  extension: string;
  width: number | null;
  height: number | null;
  sortIndex: number;
  thumbnailUrl: string;
  originalUrl: string;
};

export type AlbumAssetsDTO = {
  album: {
    id: string;
    name: string;
    assetCount: number;
  };
  items: AssetListItemDTO[];
  pagination: PaginationDTO;
};

export type ScanResultDTO = {
  taskId: string;
  status: "started" | "completed";
  albumsDiscovered?: number;
  assetsDiscovered?: number;
  startedAt?: string;
  finishedAt?: string;
};
