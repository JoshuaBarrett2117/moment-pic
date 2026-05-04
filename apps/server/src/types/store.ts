export type SourceType = "folder" | "zip";
export type SmartAlbumStatus = "active" | "hidden" | "review_pending";
export type SmartAlbumSourceEngine = "rule" | "ai" | "manual";
export type SmartAlbumRuleScope = "albumName" | "sourcePath" | "parentPath" | "assetFileName";
export type SmartAlbumRuleMatchMode = "contains" | "equals" | "prefix" | "suffix" | "regex";
export type SmartAlbumRuleAction = "assignSmartAlbum" | "mergeAlias" | "exclude";
export type SmartAlbumAiMode = "assist" | "auto_low_risk" | "full_auto";

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

export type AlbumViewRecord = {
  id: string;
  albumId: string;
  viewedAt: string;
};

export type SmartAlbumRecord = {
  id: string;
  name: string;
  normalizedKey: string;
  coverAssetId: string | null;
  albumCount: number;
  assetCount: number;
  sourceSummary: string | null;
  status: SmartAlbumStatus;
  createdAt: string;
  updatedAt: string;
};

export type SmartAlbumMemberRecord = {
  id: string;
  smartAlbumId: string;
  albumId: string;
  sourceEngine: SmartAlbumSourceEngine;
  matchRecordId: string | null;
  confidence: number;
  isPinned: boolean;
  isExcluded: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SmartAlbumMatchRecord = {
  id: string;
  albumId: string;
  smartAlbumName: string;
  normalizedKey: string;
  sourceEngine: SmartAlbumSourceEngine;
  ruleId: string | null;
  confidence: number;
  matchedScopesJson: string;
  matchedTokensJson: string;
  reason: string;
  runId: string;
  createdAt: string;
};

export type SmartAlbumRuleNormalizeOptions = {
  trimSpaces?: boolean;
  normalizeCase?: boolean;
  stripSequenceNo?: boolean;
  stripDate?: boolean;
  stripPageStats?: boolean;
  stripSizeStats?: boolean;
};

export type SmartAlbumRuleRecord = {
  id: string;
  name: string;
  enabled: boolean;
  sourceEngine: "manual" | "ai";
  priority: number;
  scope: SmartAlbumRuleScope;
  matchMode: SmartAlbumRuleMatchMode;
  patternsJson: string;
  normalizeOptionsJson: string;
  action: SmartAlbumRuleAction;
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

export type SmartAlbumAiConfigRecord = {
  id: string;
  enabled: boolean;
  mode: SmartAlbumAiMode;
  provider: "openai";
  apiEndpoint: string;
  apiToken: string | null;
  apiModel: string;
  minConfidenceAutoApply: number;
  minClusterAlbumCount: number;
  maxSuggestionsPerRun: number;
  allowAliasMerge: boolean;
  allowCrossRootGrouping: boolean;
  excludedTokensJson: string;
  preferredScopesJson: string;
  reviewRequiredBelowConfidence: number;
  createdAt: string;
  updatedAt: string;
};

export type IndexStore = {
  libraryRoots: LibraryRootRecord[];
  albums: AlbumRecord[];
  assets: AssetRecord[];
  thumbnails: ThumbnailRecord[];
  albumViews: AlbumViewRecord[];
  smartAlbums: SmartAlbumRecord[];
  smartAlbumMembers: SmartAlbumMemberRecord[];
  smartAlbumMatchRecords: SmartAlbumMatchRecord[];
  smartAlbumRules: SmartAlbumRuleRecord[];
};
