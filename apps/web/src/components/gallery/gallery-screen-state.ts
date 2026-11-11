import type { GallerySortBy } from '../../app/gallery-navigation';

export type GalleryDisplayMode = 'home' | 'albums' | 'smartAlbums' | 'directoryAlbums' | 'favorites';
export type GallerySourceType = 'folder' | 'zip' | '';
export type GallerySortOption = { value: GallerySortBy; label: string };

export const hasGalleryActiveFilters = (input: {
  isRecentActive?: boolean;
  currentKeyword: string;
  currentSortBy: GallerySortBy;
  currentSortOrder: 'asc' | 'desc';
  /** 无限滚动后不再在工具栏调整，保留参数只为兼容调用方 */
  currentPageSize?: number;
  currentSourceType: GallerySourceType;
  currentLibraryRootId: string;
  displayMode: GalleryDisplayMode;
}) =>
  !input.isRecentActive && (
  Boolean(input.currentKeyword) ||
  input.currentSortBy !== 'updatedAt' ||
  input.currentSortOrder !== 'desc' ||
  ((input.displayMode === 'albums' || input.displayMode === 'favorites') && Boolean(input.currentSourceType || input.currentLibraryRootId)));

export const getGallerySortOptions = (displayMode: GalleryDisplayMode): GallerySortOption[] => {
  if (displayMode === 'smartAlbums') {
    return [
      { value: 'updatedAt', label: '更新时间' },
      { value: 'name', label: '名称' },
      { value: 'albumCount', label: '图集数' },
      { value: 'assetCount', label: '图片数' },
    ];
  }

  return [
    { value: 'name', label: '名称' },
    { value: 'updatedAt', label: '更新时间' },
    { value: 'assetCount', label: '图片数量' },
  ];
};

export const resolveGalleryHeaderText = (input: {
  displayMode: GalleryDisplayMode;
  headerTitle?: string;
  headerDescription?: string;
}) => ({
  title: input.headerTitle ?? (
    input.displayMode === 'smartAlbums'
      ? '智能相册'
      : input.displayMode === 'directoryAlbums'
        ? '目录'
        : input.displayMode === 'favorites'
          ? '收藏'
        : '全部相册'
  ),
  description: input.headerDescription ?? (
    input.displayMode === 'smartAlbums'
      ? '按规则自动归纳出的系列图集'
      : input.displayMode === 'directoryAlbums'
        ? '按图库文件夹逐层进入，直到抵达真正的图集'
        : input.displayMode === 'favorites'
          ? '把最常回看的图集放在更顺手的位置'
        : '图库里的每一个图集'
  ),
});

/** 页面标题上方的英文眉题 */
export const resolveGalleryEyebrow = (displayMode: GalleryDisplayMode, isRecentActive?: boolean): string => {
  if (isRecentActive) return 'Recently viewed';
  switch (displayMode) {
    case 'smartAlbums': return 'Smart albums';
    case 'directoryAlbums': return 'Folders';
    case 'favorites': return 'Favorites';
    default: return 'All albums';
  }
};

export const resolveGalleryEmptyText = (input: {
  isRecentActive?: boolean;
  displayMode: GalleryDisplayMode;
  hasActiveFilters: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) => ({
  title: input.emptyTitle ?? (
    input.isRecentActive ? '还没有浏览记录' : input.hasActiveFilters
      ? input.displayMode === 'smartAlbums'
        ? '没有找到匹配的智能相册'
        : input.displayMode === 'directoryAlbums'
          ? '没有找到匹配的目录'
          : input.displayMode === 'favorites'
            ? '没有找到匹配的收藏图集'
          : '没有找到匹配的相册'
      : input.displayMode === 'smartAlbums'
        ? '还没有生成智能相册'
        : input.displayMode === 'directoryAlbums'
          ? '这里还没有可进入的目录'
          : input.displayMode === 'favorites'
            ? '还没有收藏任何图集'
          : '这里还是一片空白'
  ),
  description: input.emptyDescription ?? (
    input.isRecentActive ? '打开一个图集后，就会出现在这里。' : input.hasActiveFilters
      ? '试试清空筛选条件，或者换一个关键词。'
      : input.displayMode === 'smartAlbums'
        ? '先到设置里的“智能相册”新增规则，再重建一次。'
        : input.displayMode === 'directoryAlbums'
          ? '先扫描图库，目录会根据已扫描图集生成入口。'
          : input.displayMode === 'favorites'
            ? '在图集封面或详情页点击五角星，就会出现在这里。'
        : '到“设置 → 图库”添加媒体目录，导入你的第一个图库吧。'
  ),
});
