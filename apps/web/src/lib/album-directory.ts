import type { DirectoryAlbumsDTO } from '../types/api';

export type AlbumDirectoryRow = {
  key: string;
  name: string;
  kind: 'directory' | 'album';
  albumId: string | null;
  relativePath: string;
  assetCount: number;
  childCount: number;
  isCurrent: boolean;
};

export type AlbumDirectoryCrumb = {
  key: string;
  name: string;
  libraryRootId: string | null;
  relativePath: string;
  isCurrent: boolean;
};

export type AlbumDirectoryView = {
  title: string;
  crumbs: AlbumDirectoryCrumb[];
  rows: AlbumDirectoryRow[];
};

const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });

/**
 * 把目录树接口的返回整理成侧栏可直接渲染的两段结构：
 * - crumbs：从「目录相册」/图库根一路到当前目录的面包屑，可逐级点击回退
 * - rows：当前目录下的子目录 + 图集，图集按名称排序，当前图集置顶并高亮
 */
export const buildAlbumDirectoryView = (
  dto: DirectoryAlbumsDTO | null,
  currentAlbumId: string | null
): AlbumDirectoryView => {
  if (!dto) {
    return { title: '', crumbs: [], rows: [] };
  }

  const crumbs: AlbumDirectoryCrumb[] = dto.breadcrumbs.map((crumb, index) => ({
    key: `${crumb.libraryRootId ?? 'root'}:${crumb.relativePath || '.'}:${index}`,
    name: crumb.name,
    libraryRootId: crumb.libraryRootId,
    relativePath: crumb.relativePath,
    isCurrent: index === dto.breadcrumbs.length - 1
  }));

  const rows: AlbumDirectoryRow[] = dto.items
    .filter((item) => item.kind === 'directory' || Boolean(item.albumId))
    .map((item) => ({
      key: `${item.kind}:${item.id}`,
      name: item.name,
      kind: item.kind,
      albumId: item.albumId,
      relativePath: item.relativePath,
      assetCount: item.assetCount,
      childCount: item.childCount,
      isCurrent: Boolean(currentAlbumId) && item.albumId === currentAlbumId
    }))
    .sort((left, right) => {
      if (left.isCurrent !== right.isCurrent) {
        return left.isCurrent ? -1 : 1;
      }
      if (left.kind !== right.kind) {
        return left.kind === 'directory' ? -1 : 1;
      }
      return collator.compare(left.name, right.name);
    });

  return { title: dto.current.name, crumbs, rows };
};

/** 图集所在目录：去掉最后一段（zip 源则去掉压缩包文件名） */
export const resolveParentRelativePath = (relativePath: string | null | undefined): string => {
  if (!relativePath) {
    return '';
  }
  const segments = relativePath.split('/').filter(Boolean);
  segments.pop();
  return segments.join('/');
};
