import type { GallerySortBy } from '../../app/gallery-navigation';

export type GalleryDisplayMode = 'albums' | 'smartAlbums' | 'directoryAlbums' | 'favorites';
export type GallerySourceType = 'folder' | 'zip' | '';
export type GallerySortOption = { value: GallerySortBy; label: string };

export const hasGalleryActiveFilters = (input: {
  currentKeyword: string;
  currentSortBy: GallerySortBy;
  currentSortOrder: 'asc' | 'desc';
  currentPageSize: number;
  currentSourceType: GallerySourceType;
  currentLibraryRootId: string;
  displayMode: GalleryDisplayMode;
}) =>
  Boolean(input.currentKeyword) ||
  input.currentSortBy !== 'updatedAt' ||
  input.currentSortOrder !== 'desc' ||
  input.currentPageSize !== 24 ||
  ((input.displayMode === 'albums' || input.displayMode === 'favorites') && Boolean(input.currentSourceType || input.currentLibraryRootId));

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
      ? '自动整理'
      : input.displayMode === 'directoryAlbums'
        ? '目录相册'
        : input.displayMode === 'favorites'
          ? '收藏图集'
        : '瞬间图库'
  ),
  description: input.headerDescription ?? (
    input.displayMode === 'smartAlbums'
      ? '让归纳好的系列图集自己浮现出来'
      : input.displayMode === 'directoryAlbums'
        ? '按图库根目录逐层进入，直到抵达真正的图集。'
        : input.displayMode === 'favorites'
          ? '把最常回看的图集放在更顺手的位置'
        : '更懂你的，也更懂你如何整理回忆'
  ),
});

export const resolveGalleryEmptyText = (input: {
  displayMode: GalleryDisplayMode;
  hasActiveFilters: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) => ({
  title: input.emptyTitle ?? (
    input.hasActiveFilters
      ? input.displayMode === 'smartAlbums'
        ? '没有找到匹配的自动整理'
        : input.displayMode === 'directoryAlbums'
          ? '没有找到匹配的目录'
          : input.displayMode === 'favorites'
            ? '没有找到匹配的收藏图集'
          : '没有找到匹配的相册'
      : input.displayMode === 'smartAlbums'
        ? '还没有生成自动整理'
        : input.displayMode === 'directoryAlbums'
          ? '这里还没有可进入的目录'
          : input.displayMode === 'favorites'
            ? '还没有收藏任何图集'
          : '这里还是一片空白'
  ),
  description: input.emptyDescription ?? (
    input.hasActiveFilters
      ? '试试清空筛选条件，或者换一个关键词。'
      : input.displayMode === 'smartAlbums'
        ? '先到设置里的“智能归纳”新增规则，再重建一次自动整理。'
        : input.displayMode === 'directoryAlbums'
          ? '先扫描图库，目录相册会根据已扫描图集生成入口。'
          : input.displayMode === 'favorites'
            ? '在图集封面或详情页点击五角星，就会出现在这里。'
        : '去左侧边栏找到“设置”，导入你的第一个瞬间图库吧。'
  ),
});
