export type ViewerNextAlbumStatus = 'ready' | 'loading' | 'none';

type ViewerEndPromptProps = {
  /** ready：有下一个图集；loading：还在确认（按钮先禁用，确认后自动可点）；none：确实是最后一个 */
  nextAlbumStatus: ViewerNextAlbumStatus;
  onDismiss: () => void;
  onEnterNextAlbum: () => void;
};

export function ViewerEndPrompt({
  nextAlbumStatus,
  onDismiss,
  onEnterNextAlbum,
}: ViewerEndPromptProps) {
  const hasNext = nextAlbumStatus !== 'none';
  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center mp-scrim px-4">
      <div className="w-full max-w-md mp-glass-solid rounded-3xl p-6">
        <h3 className="font-headline text-xl font-bold text-white">当前图集已经结束</h3>
        <p className="mt-3 text-sm leading-6 text-white/75">
          {hasNext ? '是否进入下一个图集继续浏览？' : '已经是最后一个图集了。'}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          {hasNext ? (
            <>
              <button
                onClick={onDismiss}
                className="rounded-full px-4 py-2 text-sm font-semibold text-white/75 transition-colors hover:bg-white/10"
              >
                取消
              </button>
              <button
                onClick={onEnterNextAlbum}
                disabled={nextAlbumStatus !== 'ready'}
                aria-busy={nextAlbumStatus === 'loading'}
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-all hover:brightness-110 disabled:cursor-wait disabled:opacity-60 disabled:hover:brightness-100"
              >
                {nextAlbumStatus === 'loading' ? '正在查找下一个图集…' : '进入下一个图集'}
              </button>
            </>
          ) : (
            <button
              onClick={onDismiss}
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-all hover:brightness-110"
            >
              知道了
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
