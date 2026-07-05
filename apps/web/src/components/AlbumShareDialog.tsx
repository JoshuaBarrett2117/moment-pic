import { type FC, useMemo, useState } from 'react';
import { Copy, Loader2, Share2, X } from 'lucide-react';
import { createAlbumShare } from '../hooks';

type AlbumShareDialogProps = {
  albumId: string;
  albumName: string;
  onClose: () => void;
};

const toDatetimeLocalValue = (date: Date): string => {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

export const AlbumShareDialog: FC<AlbumShareDialogProps> = ({ albumId, albumName, onClose }) => {
  const defaultExpiresAt = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return toDatetimeLocalValue(date);
  }, []);
  const [password, setPassword] = useState('');
  const [expiresAt, setExpiresAt] = useState(defaultExpiresAt);
  const [shareUrl, setShareUrl] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!password.trim()) {
      setError('请输入分享密码');
      return;
    }

    const expiresAtMs = Date.parse(expiresAt);
    if (Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now()) {
      setError('请选择未来的有效期');
      return;
    }

    setIsSubmitting(true);
    const result = await createAlbumShare(albumId, {
      password,
      expiresAt: new Date(expiresAtMs).toISOString(),
    });
    setIsSubmitting(false);

    if (!result) {
      setError('创建分享失败，请稍后重试');
      return;
    }

    setShareUrl(result.shareUrl);
    try {
      await navigator.clipboard.writeText(result.shareUrl);
    } catch {
      // 浏览器可能拒绝剪贴板权限，保留链接让用户手动复制。
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      setError('复制失败，请手动复制链接');
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-outline/10 bg-surface p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-headline text-xl font-bold text-on-surface">分享图集</h3>
            <p className="mt-1 truncate text-xs text-outline">{albumName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-outline transition-colors hover:bg-surface-container-high hover:text-on-surface"
            title="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-outline">分享密码</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              className="w-full rounded-md border border-outline/20 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none transition-colors focus:border-primary"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-outline">有效期</span>
            <input
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              type="datetime-local"
              className="w-full rounded-md border border-outline/20 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none transition-colors focus:border-primary"
            />
          </label>

          {shareUrl && (
            <div className="rounded-md bg-surface-container-high p-3">
              <p className="break-all text-xs leading-5 text-on-surface">{shareUrl}</p>
            </div>
          )}

          {error && <p className="text-sm text-error">{error}</p>}

          <div className="flex justify-end gap-2">
            {shareUrl ? (
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1.5 rounded-md bg-secondary-container px-4 py-2 text-sm font-semibold text-on-secondary-container transition-all hover:brightness-95"
              >
                <Copy className="h-4 w-4" />
                复制链接
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-all hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                创建分享
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
