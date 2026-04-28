export type SourceTypeDTO = "folder" | "zip";
export type SmartAlbumStatusDTO = "active" | "hidden" | "review_pending";
export type SmartAlbumSourceEngineDTO = "rule" | "ai" | "manual";
export type SmartAlbumRuleScopeDTO = "albumName" | "sourcePath" | "parentPath" | "assetFileName";
export type SmartAlbumRuleMatchModeDTO = "contains" | "equals" | "prefix" | "suffix" | "regex";
export type SmartAlbumRuleActionDTO = "assignSmartAlbum" | "mergeAlias" | "exclude";
export type SmartAlbumAiModeDTO = "assist" | "auto_low_risk" | "full_auto";

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
    updatedAt: string;
  };
  items: AssetListItemDTO[];
  pagination: PaginationDTO;
};

export type AlbumsListDTO = {
  items: AlbumListItemDTO[];
  pagination: PaginationDTO;
};

export type RecentAlbumsDTO = {
  items: AlbumListItemDTO[];
};

export type LoginResponseDTO = {
  username: string;
  expiresAt: string;
};

export type ScanTaskStatus = "pending" | "running" | "completed" | "failed";

export type ScanResultDTO = {
  taskId: string;
  status: ScanTaskStatus;
  libraryRootId: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  albumsDiscovered: number;
  assetsDiscovered: number;
};

export type SystemConfigDTO = {
  id: string;
  enablePolling: boolean;
  pollingInterval: number;
  preloadBefore: number;
  preloadAfter: number;
  defaultImageQualityPreset: "low" | "balanced" | "high" | "original";
  albumListItemMinWidthMobile: number;
  albumListItemMinWidthDesktop: number;
  albumDetailItemMinWidthMobile: number;
  albumDetailItemMinWidthDesktop: number;
  createdAt: string;
  updatedAt: string;
};

export type SmartAlbumListItemDTO = {
  id: string;
  name: string;
  coverUrl: string | null;
  albumCount: number;
  assetCount: number;
  status: SmartAlbumStatusDTO;
  updatedAt: string;
};

export type SmartAlbumsListDTO = {
  items: SmartAlbumListItemDTO[];
  pagination: PaginationDTO;
};

export type SmartAlbumDetailDTO = {
  id: string;
  name: string;
  coverUrl: string | null;
  albumCount: number;
  assetCount: number;
  sourceSummary: string | null;
  status: SmartAlbumStatusDTO;
  updatedAt: string;
};

export type SmartAlbumMemberDTO = {
  albumId: string;
  name: string;
  sourceType: SourceTypeDTO;
  assetCount: number;
  coverUrl: string | null;
  updatedAt: string;
  sourceEngine: SmartAlbumSourceEngineDTO;
  confidence: number;
};

export type SmartAlbumMembersListDTO = {
  items: SmartAlbumMemberDTO[];
};

export type SmartAlbumRuleNormalizeOptionsDTO = {
  trimSpaces?: boolean;
  normalizeCase?: boolean;
  stripSequenceNo?: boolean;
  stripDate?: boolean;
  stripPageStats?: boolean;
  stripSizeStats?: boolean;
};

export type SmartAlbumRuleDTO = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  scope: SmartAlbumRuleScopeDTO;
  matchMode: SmartAlbumRuleMatchModeDTO;
  patterns: string[];
  normalizeOptions: SmartAlbumRuleNormalizeOptionsDTO;
  action: SmartAlbumRuleActionDTO;
  targetName: string | null;
  targetNameTemplate: string | null;
  minAlbumCount: number;
  minConfidence: number;
  createdAt: string;
  updatedAt: string;
};

export type SmartAlbumRuleListDTO = {
  items: SmartAlbumRuleDTO[];
};

export type SmartAlbumAiConfigDTO = {
  id: string;
  enabled: boolean;
  mode: SmartAlbumAiModeDTO;
  minConfidenceAutoApply: number;
  minClusterAlbumCount: number;
  maxSuggestionsPerRun: number;
  allowAliasMerge: boolean;
  allowCrossRootGrouping: boolean;
  excludedTokens: string[];
  preferredScopes: SmartAlbumRuleScopeDTO[];
  reviewRequiredBelowConfidence: number;
  createdAt: string;
  updatedAt: string;
};

export type SmartAlbumRuleTestResultDTO = {
  rule: SmartAlbumRuleDTO;
  matchedAlbums: Array<{
    albumId: string;
    name: string;
    targetName: string;
  }>;
};

export type SmartAlbumRebuildResultDTO = {
  smartAlbumsDiscovered: number;
  membersDiscovered: number;
};
