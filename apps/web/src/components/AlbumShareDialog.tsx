import { type FC, useMemo, useState } from 'react';
import { Copy, Loader2, RefreshCw, Share2, X } from 'lucide-react';
import { createAlbumShare } from '../hooks';
import { useToast } from './Toast';

type AlbumShareDialogProps = {
  albumId: string;
  albumName: string;
  onClose: () => void;
};

const toDatetimeLocalValue = (date: Date): string => {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const generateSharePassword = (): string => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
};

export const AlbumShareDialog: FC<AlbumShareDialogProps> = ({ albumId, albumName, onClose }) => {
  const { toast } = useToast();
  const defaultExpiresAt = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return toDatetimeLocalValue(date);
  }, []);
  const [password, setPassword] = useState(() => generateSharePassword());
  const [expiresAt, setExpiresAt] = useState(defaultExpiresAt);
  const [shareUrl, setShareUrl] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const shareText = shareUrl
    ? [
      `图集：${albumName}`,
      `链接：${shareUrl}`,
      `密码：${password}`,
      `有效期：${new Date(expiresAt).toLocaleString('zh-CN')}`
    ].join('\n')
    : '';

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
      await navigator.clipboard.writeText([
        `图集：${albumName}`,
        `链接：${result.shareUrl}`,
        `密码：${password}`,
        `有效期：${new Date(expiresAtMs).toLocaleString('zh-CN')}`
      ].join('\n'));
      toast('分享链接和密码已复制', 'success');
    } catch {
      // 浏览器可能拒绝剪贴板权限，保留链接让用户手动复制。
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareText);
      toast('分享链接和密码已复制', 'success');
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
            <div className="flex gap-2">
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="text"
                className="min-w-0 flex-1 rounded-md border border-outline/20 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none transition-colors focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setPassword(generateSharePassword())}
                className="flex h-10 w-10 items-center justify-center rounded-md bg-surface-container-high text-outline transition-colors hover:text-on-surface"
                title="随机生成密码"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
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
              <pre className="whitespace-pre-wrap break-all font-sans text-xs leading-5 text-on-surface">{shareText}</pre>
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
                复制链接和密码
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
