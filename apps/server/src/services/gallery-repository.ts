import type {
  AlbumRecord,
  AlbumViewRecord,
  AssetRecord,
  LibraryRootRecord,
  SmartAlbumAiConfigRecord,
  SmartAlbumMatchRecord,
  SmartAlbumMemberRecord,
  SmartAlbumRecord,
  SmartAlbumRuleRecord,
  ThumbnailRecord
} from "../types/store.js";
import type { AlbumSortBy, SortOrder, SystemConfigRecord } from "./sqlite-store.js";

export type AlbumListQuery = {
  libraryRootId?: string;
  sourceType?: "folder" | "zip";
  keyword?: string;
  sortBy?: AlbumSortBy;
  sortOrder?: SortOrder;
};

export type SmartAlbumListQuery = {
  keyword?: string;
  status?: "active" | "hidden" | "review_pending";
  sortBy?: "name" | "updatedAt" | "albumCount" | "assetCount";
  sortOrder?: "asc" | "desc";
};

export type SmartRuleScopeAlbum = {
  id: string;
  name: string;
  sourcePath: string;
  assetCount: number;
  coverAssetId: string | null;
  updatedAt: string;
  sourceType: "folder" | "zip";
};

export type GalleryRepository = {
  makeId(prefix: string): string;
  listLibraryRoots(): Promise<LibraryRootRecord[]>;
  findLibraryRootByPath(targetPath: string): Promise<LibraryRootRecord | null>;
  findLibraryRootById(id: string): Promise<LibraryRootRecord | null>;
  upsertLibraryRoot(root: LibraryRootRecord): Promise<void>;
  deleteLibraryRoot(id: string): Promise<void>;
  updateLibraryRoot(id: string, updates: { name?: string; path?: string; enabled?: boolean }): Promise<LibraryRootRecord | null>;
  clearLibraryData(libraryRootId: string): Promise<void>;
  insertAlbumWithAssets(album: AlbumRecord, assets: AssetRecord[]): Promise<void>;
  applyLibraryRootScanDiff(input: {
    removedAlbumIds: string[];
    replacedAlbums: Array<{
      existingAlbumId: string | null;
      album: AlbumRecord;
      assets: AssetRecord[];
    }>;
  }): Promise<void>;
  listAlbums(page: number, pageSize: number, input?: AlbumListQuery): Promise<{ items: AlbumRecord[]; total: number }>;
  listAlbumsByLibraryRootId(libraryRootId: string): Promise<AlbumRecord[]>;
  findAlbumById(albumId: string): Promise<AlbumRecord | null>;
  listAssetsByAlbumId(albumId: string, page?: number, pageSize?: number): Promise<AssetRecord[]>;
  countAssetsByAlbumId(albumId: string): Promise<number>;
  listAlbumCoverAssetIds(libraryRootId?: string, limit?: number): Promise<string[]>;
  findAssetById(assetId: string): Promise<AssetRecord | null>;
  updateAssetMetadata(assetId: string, input: { width: number | null; height: number | null; thumbnailKey: string | null; updatedAt: string }): Promise<void>;
  findThumbnailByAssetId(assetId: string): Promise<ThumbnailRecord | null>;
  upsertThumbnail(thumbnail: ThumbnailRecord): Promise<void>;
  deleteAlbum(albumId: string): Promise<void>;
  deleteAsset(assetId: string): Promise<void>;
  updateAlbumScanMetadata(albumId: string, input: { sourceMtime: string | null; assetsFingerprint: string | null; updatedAt: string }): Promise<void>;
  getSystemConfig(): Promise<SystemConfigRecord>;
  updateSystemConfig(updates: {
    enablePolling?: boolean;
    pollingInterval?: number;
    preloadBefore?: number;
    preloadAfter?: number;
    defaultImageQualityPreset?: "low" | "balanced" | "high" | "original";
    albumListItemMinWidthMobile?: number;
    albumListItemMinWidthDesktop?: number;
    albumDetailItemMinWidthMobile?: number;
    albumDetailItemMinWidthDesktop?: number;
  }): Promise<SystemConfigRecord>;
  recordAlbumView(albumId: string): Promise<void>;
  listRecentAlbumViews(limit?: number): Promise<AlbumViewRecord[]>;
  getRecentAlbumIds(limit?: number): Promise<string[]>;
  listSmartAlbums(page: number, pageSize: number, input?: SmartAlbumListQuery): Promise<{ items: SmartAlbumRecord[]; total: number }>;
  findSmartAlbumById(smartAlbumId: string): Promise<SmartAlbumRecord | null>;
  listSmartAlbumMembers(smartAlbumId: string): Promise<SmartAlbumMemberRecord[]>;
  listSmartAlbumRules(): Promise<SmartAlbumRuleRecord[]>;
  findSmartAlbumRuleById(ruleId: string): Promise<SmartAlbumRuleRecord | null>;
  upsertSmartAlbumRule(rule: SmartAlbumRuleRecord): Promise<SmartAlbumRuleRecord>;
  deleteSmartAlbumRule(ruleId: string): Promise<boolean>;
  getSmartAlbumAiConfig(): Promise<SmartAlbumAiConfigRecord>;
  updateSmartAlbumAiConfig(updates: Omit<SmartAlbumAiConfigRecord, "createdAt" | "updatedAt">): Promise<SmartAlbumAiConfigRecord>;
  replaceSmartAlbums(input: {
    smartAlbums: SmartAlbumRecord[];
    members: SmartAlbumMemberRecord[];
    matchRecords: SmartAlbumMatchRecord[];
  }): Promise<void>;
  listAlbumsForSmartRuleScope(): Promise<SmartRuleScopeAlbum[]>;
  listAssetNamesByAlbumId(albumId: string): Promise<string[]>;
};
