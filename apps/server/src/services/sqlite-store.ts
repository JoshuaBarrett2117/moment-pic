export { makeId } from "../repositories/ids.js";
export {
  findLibraryRootByIdDb,
  findLibraryRootByPathDb,
  listLibraryRootsDb,
  upsertLibraryRootDb,
  deleteLibraryRootDb,
  updateLibraryRootDb,
  clearLibraryDataDb
} from "../repositories/library-root-repository.js";
export {
  type AlbumSortBy,
  type SortOrder,
  insertAlbumWithAssetsDb,
  applyLibraryRootScanDiffDb,
  listAlbumsDb,
  listAlbumsByLibraryRootIdDb,
  findAlbumByIdDb,
  listAssetsByAlbumIdDb,
  countAssetsByAlbumIdDb,
  listAlbumCoverAssetIdsDb,
  findAssetByIdDb,
  updateAssetMetadataDb,
  findThumbnailByAssetIdDb,
  upsertThumbnailDb,
  deleteAlbumDb,
  deleteAssetDb,
  updateAlbumScanMetadataDb,
  listAlbumsForSmartRuleScopeDb,
  listAssetNamesByAlbumIdDb
} from "../repositories/album-repository.js";
export {
  type SystemConfigRecord,
  getSystemConfigDb,
  updateSystemConfigDb,
  recordAlbumViewDb,
  listRecentAlbumViewsDb,
  getRecentAlbumIdsDb
} from "../repositories/system-config-repository.js";
export {
  listSmartAlbumsDb,
  findSmartAlbumByIdDb,
  listSmartAlbumMembersDb,
  listSmartAlbumRulesDb,
  findSmartAlbumRuleByIdDb,
  upsertSmartAlbumRuleDb,
  deleteSmartAlbumRuleDb,
  getSmartAlbumAiConfigDb,
  updateSmartAlbumAiConfigDb,
  replaceSmartAlbumsDb
} from "../repositories/smart-album-repository.js";
