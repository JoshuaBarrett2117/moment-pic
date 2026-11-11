type ViewerEndPromptProps = {
  canRequestNextAlbum: boolean;
  onDismiss: () => void;
  onEnterNextAlbum: () => void;
};

export function ViewerEndPrompt({
  canRequestNextAlbum,
  onDismiss,
  onEnterNextAlbum,
}: ViewerEndPromptProps) {
  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center mp-scrim px-4">
      <div className="w-full max-w-md mp-glass-solid rounded-3xl p-6">
        <h3 className="font-headline text-xl font-bold text-white">当前图集已经结束</h3>
        <p className="mt-3 text-sm leading-6 text-white/75">是否进入下一个图集继续浏览？</p>
        <div className="mt-6 flex justify-end gap-3">
          {canRequestNextAlbum ? (
            <>
              <button
                onClick={onDismiss}
                className="rounded-full px-4 py-2 text-sm font-semibold text-white/75 transition-colors hover:bg-white/10"
              >
                取消
              </button>
              <button
                onClick={onEnterNextAlbum}
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-all hover:brightness-110"
              >
                进入下一个图集
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
