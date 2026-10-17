import { useContinueReading } from '../hooks/use-continue-reading';

export const ContinueReading = ({ onOpen }: { onOpen: (albumId: string) => void }) => {
  const items = useContinueReading();
  if (!items.length) return null;
  return <section aria-label="继续阅读" className="mb-8">
    <h2 className="mb-4 font-headline text-xl font-bold">继续阅读</h2>
    <div className="flex gap-4 overflow-x-auto pb-3">
      {items.map(({ album, progress }) => <button key={album.id} onClick={() => onOpen(album.id)} className="flex w-56 shrink-0 items-center gap-3 rounded-xl bg-surface-container p-3 text-left">
        {album.coverUrl && <img src={album.coverUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" loading="lazy" />}
        <span className="min-w-0"><span className="block truncate font-medium">{album.name}</span><span className="text-xs text-outline">继续上次第 {progress.assetIndex + 1} 页 / 共 {progress.total} 页</span></span>
      </button>)}
    </div>
  </section>;
};
