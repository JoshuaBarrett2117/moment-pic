import type {
  AlbumAssetsDTO,
  AlbumDetailDTO,
  AlbumListItemDTO,
  AssetDetailDTO,
  LibraryRootDTO,
  ScanResultDTO
} from "../types/dto.js";

export const mockLibraryRoots: LibraryRootDTO[] = [
  {
    id: "root_001",
    name: "默认图库",
    path: "/data/library",
    enabled: true,
    lastScannedAt: "2026-04-09T10:00:00.000Z"
  }
];

export const mockAlbums: AlbumListItemDTO[] = [
  {
    id: "alb_001",
    name: "风景1",
    sourceType: "folder",
    assetCount: 2,
    coverUrl: "/api/v1/assets/ast_001/thumbnail",
    updatedAt: "2026-04-09T10:00:00.000Z"
  },
  {
    id: "alb_002",
    name: "风景2",
    sourceType: "zip",
    assetCount: 2,
    coverUrl: "/api/v1/assets/ast_101/thumbnail",
    updatedAt: "2026-04-09T10:00:00.000Z"
  }
];

export const mockAlbumDetails: Record<string, AlbumDetailDTO> = {
  alb_001: {
    id: "alb_001",
    name: "风景1",
    sourceType: "folder",
    assetCount: 2,
    coverAssetId: "ast_001",
    updatedAt: "2026-04-09T10:00:00.000Z"
  },
  alb_002: {
    id: "alb_002",
    name: "风景2",
    sourceType: "zip",
    assetCount: 2,
    coverAssetId: "ast_101",
    updatedAt: "2026-04-09T10:00:00.000Z"
  }
};

export const mockAlbumAssets: Record<string, AlbumAssetsDTO> = {
  alb_001: {
    album: {
      id: "alb_001",
      name: "风景1",
      assetCount: 2,
      updatedAt: "2026-04-09T10:00:00.000Z"
    },
    items: [
      {
        id: "ast_001",
        name: "001.jpg",
        extension: "jpg",
        width: 1280,
        height: 720,
        sortIndex: 1,
        thumbnailUrl: "/api/v1/assets/ast_001/thumbnail",
        originalUrl: "/api/v1/assets/ast_001/original"
      },
      {
        id: "ast_002",
        name: "002.png",
        extension: "png",
        width: 1280,
        height: 720,
        sortIndex: 2,
        thumbnailUrl: "/api/v1/assets/ast_002/thumbnail",
        originalUrl: "/api/v1/assets/ast_002/original"
      }
    ],
    pagination: {
      page: 1,
      pageSize: 100,
      total: 2
    }
  },
  alb_002: {
    album: {
      id: "alb_002",
      name: "风景2",
      assetCount: 2,
      updatedAt: "2026-04-09T10:00:00.000Z"
    },
    items: [
      {
        id: "ast_101",
        name: "001.webp",
        extension: "webp",
        width: 1280,
        height: 720,
        sortIndex: 1,
        thumbnailUrl: "/api/v1/assets/ast_101/thumbnail",
        originalUrl: "/api/v1/assets/ast_101/original"
      },
      {
        id: "ast_102",
        name: "002.gif",
        extension: "gif",
        width: 960,
        height: 540,
        sortIndex: 2,
        thumbnailUrl: "/api/v1/assets/ast_102/thumbnail",
        originalUrl: "/api/v1/assets/ast_102/original"
      }
    ],
    pagination: {
      page: 1,
      pageSize: 100,
      total: 2
    }
  }
};

export const mockAssets: Record<string, AssetDetailDTO> = Object.fromEntries(
  Object.values(mockAlbumAssets)
    .flatMap((album) => album.items)
    .map((asset) => [
      asset.id,
      {
        id: asset.id,
        albumId: Object.entries(mockAlbumAssets).find(([, album]) =>
          album.items.some((item) => item.id === asset.id)
        )?.[0] ?? "unknown",
        name: asset.name,
        extension: asset.extension,
        width: asset.width,
        height: asset.height,
        sortIndex: asset.sortIndex,
        thumbnailUrl: asset.thumbnailUrl,
        originalUrl: asset.originalUrl
      }
    ])
);

export const buildMockScanResult = (): ScanResultDTO => ({
  taskId: "scan_local_001",
  status: "completed",
  albumsDiscovered: mockAlbums.length,
  assetsDiscovered: Object.values(mockAlbumAssets).reduce((sum, album) => sum + album.items.length, 0),
  startedAt: "2026-04-09T10:00:00.000Z",
  finishedAt: "2026-04-09T10:00:02.000Z"
});
