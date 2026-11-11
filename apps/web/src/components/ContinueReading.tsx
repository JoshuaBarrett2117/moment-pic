import { useContinueReading } from '../hooks/use-continue-reading';
import { ThrottledImage } from './ThrottledImage';

/** 继续阅读：横向玻璃卡片，显示页码与进度条。没有记录时整块隐藏。 */
export const ContinueReading = ({ onOpen, title = '继续阅读' }: { onOpen: (albumId: string) => void; title?: string }) => {
  const items = useContinueReading();
  if (!items.length) return null;
  return (
    <section aria-label="继续阅读" className="mb-9">
      <h2 className="mp-title mb-3.5 text-[17px]">{title}</h2>
      <div className="custom-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
        {items.map(({ album, progress }) => {
          const percent = progress.total > 0 ? Math.min(100, Math.round(((progress.assetIndex + 1) / progress.total) * 100)) : 0;
          return (
            <button
              key={album.id}
              type="button"
              onClick={() => onOpen(album.id)}
              className="mp-glass-panel flex w-[17.5rem] shrink-0 items-center gap-3 rounded-[14px] p-2.5 text-left transition-colors hover:border-outline"
            >
              {album.coverUrl ? (
                <ThrottledImage src={album.coverUrl} alt="" className="h-16 w-16 shrink-0 rounded-[10px] object-cover" />
              ) : (
                <span className="h-16 w-16 shrink-0 rounded-[10px] bg-surface-container-high" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-on-surface">{album.name}</span>
                <span className="mt-0.5 block text-xs tabular-nums text-on-surface-variant">第 {progress.assetIndex + 1} / {progress.total} 张</span>
                <span className="mt-2 block h-[3px] overflow-hidden rounded-full bg-surface-container-high">
                  <span className="bg-progress block h-full rounded-full" style={{ width: `${percent}%` }} />
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
