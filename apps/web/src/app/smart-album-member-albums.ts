import type { GalleryFilters, GallerySortBy } from './gallery-navigation';
import type { AlbumListItemDTO, SmartAlbumMemberDTO } from '../types/api';

export const resolveSmartAlbumMemberSortBy = (sortBy: GallerySortBy): Exclude<GallerySortBy, 'albumCount'> =>
  sortBy === 'albumCount' ? 'updatedAt' : sortBy;

export const buildSmartAlbumMemberAlbums = (
  members: SmartAlbumMemberDTO[] | null | undefined,
  filters: Pick<GalleryFilters, 'keyword' | 'sortBy' | 'sortOrder' | 'sourceType'>
): AlbumListItemDTO[] => {
  const sortBy = resolveSmartAlbumMemberSortBy(filters.sortBy);

  return ((members || []).map((member) => ({
    id: member.albumId,
    name: member.name,
    sourceType: member.sourceType,
    assetCount: member.assetCount,
    coverUrl: member.coverUrl,
    updatedAt: member.updatedAt,
  })) as AlbumListItemDTO[])
    .filter((album) => {
      if (filters.sourceType && album.sourceType !== filters.sourceType) {
        return false;
      }

      if (!filters.keyword.trim()) {
        return true;
      }

      return album.name.toLowerCase().includes(filters.keyword.trim().toLowerCase());
    })
    .sort((left, right) => {
      const directionFactor = filters.sortOrder === 'asc' ? 1 : -1;

      if (sortBy === 'name') {
        return left.name.localeCompare(right.name, 'zh-CN') * directionFactor;
      }

      if (sortBy === 'assetCount') {
        return (left.assetCount - right.assetCount) * directionFactor;
      }

      return (new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime()) * directionFactor;
    });
};
