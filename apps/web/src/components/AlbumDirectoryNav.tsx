import { type FC, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Folder, FolderOpen, Images, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { buildAlbumDirectoryView } from '../lib/album-directory';
import type { DirectoryAlbumsDTO } from '../types/api';

interface AlbumDirectoryNavProps {
  /** 图集所属图库根；缺失时不渲染侧栏目录 */
  libraryRootId?: string | null;
  /** 图集所在目录（相对图库根），同级图集就是这里的 items */
  relativePath?: string | null;
  currentAlbumId: string;
  /** 点击同级图集时切换详情页；未提供则只做高亮不可跳转 */
  onSelectAlbum?: (albumId: string) => void;
  className?: string;
}

type DirectoryTarget = {
  libraryRootId: string | null;
  relativePath: string;
};

/**
 * 图集详情左侧栏的「目录」：显示该图集在图库中的位置（图库根 › 各级目录），
 * 并列出同目录下的其他图集，可直接跳转；子目录可继续下钻。
 */
export const AlbumDirectoryNav: FC<AlbumDirectoryNavProps> = ({
  libraryRootId,
  relativePath,
  currentAlbumId,
  onSelectAlbum,
  className = ''
}) => {
  const homeTarget = useMemo<DirectoryTarget>(
    () => ({ libraryRootId: libraryRootId ?? null, relativePath: relativePath ?? '' }),
    [libraryRootId, relativePath]
  );
  const [target, setTarget] = useState<DirectoryTarget>(homeTarget);
  const [data, setData] = useState<DirectoryAlbumsDTO | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTarget(homeTarget);
  }, [homeTarget]);

  useEffect(() => {
    if (libraryRootId === undefined) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    void api
      .get<DirectoryAlbumsDTO>(
        '/albums/directory-tree',
        {
          libraryRootId: target.libraryRootId || undefined,
          relativePath: target.relativePath || undefined
        },
        { signal: controller.signal }
      )
      .then((result) => {
        if (!cancelled) {
          setData(result);
        }
      })
      .catch((requestError: unknown) => {
        if (cancelled) {
          return;
        }
        setError(requestError instanceof Error ? requestError.message : '读取目录失败');
        setData(null);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [libraryRootId, target]);

  const view = useMemo(() => buildAlbumDirectoryView(data, currentAlbumId), [data, currentAlbumId]);
  const isHome = target.relativePath === (relativePath ?? '');

  const openDirectory = useCallback((next: DirectoryTarget) => {
    setTarget(next);
  }, []);

  if (libraryRootId === undefined) {
    return null;
  }

  return (
    <section className={`flex min-h-0 flex-col gap-2 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-headline text-sm font-bold text-on-surface">目录</h2>
        {!isHome && (
          <button
            type="button"
            onClick={() => setTarget(homeTarget)}
            className="flex items-center gap-0.5 text-[10px] text-outline transition-colors hover:text-primary"
          >
            <ChevronLeft className="h-3 w-3" />
            回到当前图集
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] leading-tight text-outline">
        {view.crumbs.map((crumb, index) => (
          <span key={crumb.key} className="flex items-center gap-1">
            {index > 0 && <span className="opacity-40">›</span>}
            <button
              type="button"
              onClick={() =>
                !crumb.isCurrent &&
                openDirectory({ libraryRootId: crumb.libraryRootId ?? libraryRootId ?? null, relativePath: crumb.relativePath })
              }
              className={`max-w-[110px] truncate transition-colors ${
                crumb.isCurrent ? 'font-medium text-on-surface' : 'hover:text-primary'
              }`}
              title={crumb.name}
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </div>

      <div className="flex max-h-[240px] min-h-[64px] flex-col gap-0.5 overflow-y-auto rounded-xl bg-surface-container p-1.5 custom-scrollbar">
        {isLoading && (
          <div className="flex items-center justify-center py-3 text-outline">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}

        {!isLoading && error && <p className="px-1 py-2 text-[10px] text-error">{error}</p>}

        {!isLoading && !error && view.rows.length === 0 && (
          <p className="px-1 py-2 text-[10px] text-outline">该目录下没有其他图集</p>
        )}

        {!isLoading &&
          !error &&
          view.rows.map((row) => {
            const isDirectory = row.kind === 'directory';
            const disabled = !isDirectory && (!row.albumId || !onSelectAlbum || row.isCurrent);
            return (
              <button
                key={row.key}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (isDirectory) {
                    openDirectory({ libraryRootId: target.libraryRootId, relativePath: row.relativePath });
                    return;
                  }
                  if (row.albumId) {
                    onSelectAlbum?.(row.albumId);
                  }
                }}
                className={`flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-left text-[11px] transition-colors ${
                  row.isCurrent
                    ? 'bg-primary-container font-medium text-on-primary-container'
                    : 'text-on-surface hover:bg-surface-container-high'
                } ${disabled ? 'cursor-default' : ''}`}
                title={isDirectory ? `进入 ${row.name}` : row.name}
              >
                {isDirectory ? (
                  <Folder className="h-3.5 w-3.5 shrink-0 text-primary opacity-70" />
                ) : row.isCurrent ? (
                  <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <Images className="h-3.5 w-3.5 shrink-0 text-outline" />
                )}
                <span className="truncate">{row.name}</span>
                {!isDirectory && <span className="ml-auto shrink-0 text-[9px] text-outline">{row.assetCount}</span>}
                {isDirectory && row.childCount > 0 && (
                  <span className="ml-auto shrink-0 text-[9px] text-outline">{row.childCount}</span>
                )}
              </button>
            );
          })}
      </div>
    </section>
  );
};
