export type SourceTypeDTO = "folder" | "zip";
export type SmartAlbumStatusDTO = "active" | "hidden" | "review_pending";
export type SmartAlbumSourceEngineDTO = "rule" | "ai" | "manual";
export type SmartAlbumRuleScopeDTO = "albumName" | "sourcePath" | "parentPath" | "assetFileName";
export type SmartAlbumRuleMatchModeDTO = "contains" | "equals" | "prefix" | "suffix" | "regex";
export type SmartAlbumRuleActionDTO = "assignSmartAlbum" | "mergeAlias" | "exclude";
export type SmartAlbumAiModeDTO = "assist" | "auto_low_risk" | "full_auto";
export type PageTransitionModeDTO = "page" | "normal";

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
  isFavorite: boolean;
  updatedAt: string;
};

export type DirectoryAlbumNodeDTO = {
  id: string;
  name: string;
  kind: "directory" | "album";
  libraryRootId: string;
  relativePath: string;
  albumId: string | null;
  sourceType: SourceTypeDTO | null;
  assetCount: number;
  coverUrl: string | null;
  updatedAt: string | null;
  childCount: number;
};

export type DirectoryAlbumBreadcrumbDTO = {
  name: string;
  libraryRootId: string | null;
  relativePath: string;
};

export type DirectoryAlbumsDTO = {
  current: {
    name: string;
    libraryRootId: string | null;
    relativePath: string;
  };
  breadcrumbs: DirectoryAlbumBreadcrumbDTO[];
  items: DirectoryAlbumNodeDTO[];
};

export type AlbumDetailDTO = {
  id: string;
  name: string;
  sourceType: SourceTypeDTO;
  assetCount: number;
  coverAssetId: string | null;
  isFavorite: boolean;
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
    isFavorite: boolean;
    updatedAt: string;
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

export type SmartAlbumListItemDTO = {
  id: string;
  name: string;
  coverUrl: string | null;
  albumCount: number;
  assetCount: number;
  status: SmartAlbumStatusDTO;
  updatedAt: string;
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
  isFavorite: boolean;
  updatedAt: string;
  sourceEngine: SmartAlbumSourceEngineDTO;
  confidence: number;
};

export type SmartAlbumRuleDTO = {
  id: string;
  name: string;
  enabled: boolean;
  sourceEngine: "manual" | "ai";
  priority: number;
  scope: SmartAlbumRuleScopeDTO;
  matchMode: SmartAlbumRuleMatchModeDTO;
  patterns: string[];
  normalizeOptions: {
    trimSpaces?: boolean;
    normalizeCase?: boolean;
    stripSequenceNo?: boolean;
    stripDate?: boolean;
    stripPageStats?: boolean;
    stripSizeStats?: boolean;
  };
  action: SmartAlbumRuleActionDTO;
  targetName: string | null;
  targetNameTemplate: string | null;
  minAlbumCount: number;
  minConfidence: number;
  generatedNormalizedKey: string | null;
  generatedConfidence: number | null;
  generatedReason: string | null;
  generatedRunId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SmartAlbumAiConfigDTO = {
  id: string;
  enabled: boolean;
  mode: SmartAlbumAiModeDTO;
  provider: "openai";
  apiEndpoint: string;
  apiModel: string;
  hasApiToken: boolean;
  apiTokenMasked: string | null;
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

export type SmartAlbumAiConnectionTestDTO = {
  success: boolean;
  message: string;
  endpoint: string;
  model: string;
  latencyMs: number;
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

export type SmartAlbumRebuildTaskDTO = {
  taskId: string;
  status: "pending" | "running" | "completed" | "failed";
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  result: SmartAlbumRebuildResultDTO | null;
};

export type AlbumFavoriteDTO = {
  albumId: string;
  isFavorite: boolean;
};

export type AlbumShareDTO = {
  token: string;
  shareUrl: string;
  expiresAt: string;
};

export type SharedAlbumAuthDTO = {
  token: string;
  accessToken: string;
  albumId: string;
  name: string;
  expiresAt: string;
};
