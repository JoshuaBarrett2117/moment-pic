import {
  applyLibraryRootScanDiffDb,
  clearLibraryDataDb,
  countAssetsByAlbumIdDb,
  deleteAlbumDb,
  deleteAssetDb,
  deleteLibraryRootDb,
  deleteSmartAlbumRuleDb,
  findAlbumByIdDb,
  findAssetByIdDb,
  findLibraryRootByIdDb,
  findLibraryRootByPathDb,
  findSmartAlbumByIdDb,
  findSmartAlbumRuleByIdDb,
  findThumbnailByAssetIdDb,
  getRecentAlbumIdsDb,
  getSmartAlbumAiConfigDb,
  getSystemConfigDb,
  insertAlbumWithAssetsDb,
  listAlbumCoverAssetIdsDb,
  listAlbumsByLibraryRootIdDb,
  listAlbumsDb,
  listAlbumsForSmartRuleScopeDb,
  listAssetNamesByAlbumIdDb,
  listAssetsByAlbumIdDb,
  listLibraryRootsDb,
  listRecentAlbumViewsDb,
  listSmartAlbumMembersDb,
  listSmartAlbumRulesDb,
  listSmartAlbumsDb,
  makeId,
  recordAlbumViewDb,
  replaceSmartAlbumsDb,
  updateAlbumScanMetadataDb,
  updateAssetMetadataDb,
  updateLibraryRootDb,
  updateSmartAlbumAiConfigDb,
  updateSystemConfigDb,
  upsertLibraryRootDb,
  upsertSmartAlbumRuleDb,
  upsertThumbnailDb
} from "./sqlite-store.js";
import type { GalleryRepository } from "./gallery-repository.js";

export const sqliteGalleryRepository: GalleryRepository = {
  makeId,
  listLibraryRoots: async () => listLibraryRootsDb(),
  findLibraryRootByPath: async (targetPath) => findLibraryRootByPathDb(targetPath),
  findLibraryRootById: async (id) => findLibraryRootByIdDb(id),
  upsertLibraryRoot: async (root) => {
    upsertLibraryRootDb(root);
  },
  deleteLibraryRoot: async (id) => {
    deleteLibraryRootDb(id);
  },
  updateLibraryRoot: async (id, updates) => updateLibraryRootDb(id, updates),
  clearLibraryData: async (libraryRootId) => {
    clearLibraryDataDb(libraryRootId);
  },
  insertAlbumWithAssets: async (album, assets) => {
    insertAlbumWithAssetsDb(album, assets);
  },
  applyLibraryRootScanDiff: async (input) => {
    applyLibraryRootScanDiffDb(input);
  },
  listAlbums: async (page, pageSize, input) => listAlbumsDb(page, pageSize, input),
  listAlbumsByLibraryRootId: async (libraryRootId) => listAlbumsByLibraryRootIdDb(libraryRootId),
  findAlbumById: async (albumId) => findAlbumByIdDb(albumId),
  listAssetsByAlbumId: async (albumId, page, pageSize) => listAssetsByAlbumIdDb(albumId, page, pageSize),
  countAssetsByAlbumId: async (albumId) => countAssetsByAlbumIdDb(albumId),
  listAlbumCoverAssetIds: async (libraryRootId, limit) => listAlbumCoverAssetIdsDb(libraryRootId, limit),
  findAssetById: async (assetId) => findAssetByIdDb(assetId),
  updateAssetMetadata: async (assetId, input) => {
    updateAssetMetadataDb(assetId, input);
  },
  findThumbnailByAssetId: async (assetId) => findThumbnailByAssetIdDb(assetId),
  upsertThumbnail: async (thumbnail) => {
    upsertThumbnailDb(thumbnail);
  },
  deleteAlbum: async (albumId) => {
    deleteAlbumDb(albumId);
  },
  deleteAsset: async (assetId) => {
    deleteAssetDb(assetId);
  },
  updateAlbumScanMetadata: async (albumId, input) => {
    updateAlbumScanMetadataDb(albumId, input);
  },
  getSystemConfig: async () => getSystemConfigDb(),
  updateSystemConfig: async (updates) => updateSystemConfigDb(updates),
  recordAlbumView: async (albumId) => {
    recordAlbumViewDb(albumId);
  },
  listRecentAlbumViews: async (limit) => listRecentAlbumViewsDb(limit),
  getRecentAlbumIds: async (limit) => getRecentAlbumIdsDb(limit),
  listSmartAlbums: async (page, pageSize, input) => listSmartAlbumsDb(page, pageSize, input),
  findSmartAlbumById: async (smartAlbumId) => findSmartAlbumByIdDb(smartAlbumId),
  listSmartAlbumMembers: async (smartAlbumId) => listSmartAlbumMembersDb(smartAlbumId),
  listSmartAlbumRules: async () => listSmartAlbumRulesDb(),
  findSmartAlbumRuleById: async (ruleId) => findSmartAlbumRuleByIdDb(ruleId),
  upsertSmartAlbumRule: async (rule) => upsertSmartAlbumRuleDb(rule),
  deleteSmartAlbumRule: async (ruleId) => deleteSmartAlbumRuleDb(ruleId),
  getSmartAlbumAiConfig: async () => getSmartAlbumAiConfigDb(),
  updateSmartAlbumAiConfig: async (updates) => updateSmartAlbumAiConfigDb(updates),
  replaceSmartAlbums: async (input) => {
    replaceSmartAlbumsDb(input);
  },
  listAlbumsForSmartRuleScope: async () => listAlbumsForSmartRuleScopeDb(),
  listAssetNamesByAlbumId: async (albumId) => listAssetNamesByAlbumIdDb(albumId)
};
