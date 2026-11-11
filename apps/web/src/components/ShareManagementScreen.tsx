import { type FC, useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, Loader2, Share2, Trash2 } from 'lucide-react';
import { resetManagedAlbumSharePassword } from '../hooks/useAlbums';
import { deleteManagedAlbumShare, fetchManagedAlbumShares } from '../hooks';
import type { ManagedAlbumShareDTO } from '../types/api';
import { GalleryHeader } from './gallery/GalleryHeader';
import { Sidebar } from './Sidebar';
import { ThrottledImage } from './ThrottledImage';
import { useToast } from './Toast';

type ShareManagementScreenProps = {
  onBack?: () => void;
};

export const ShareManagementScreen: FC<ShareManagementScreenProps> = () => {
  const { toast } = useToast();
  const [items, setItems] = useState<ManagedAlbumShareDTO[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const loadShares = useCallback(async () => {
    setIsLoading(true);
    setError('');
    const result = await fetchManagedAlbumShares();
    setIsLoading(false);
    if (!result) {
      setError('加载分享列表失败');
      return;
    }
    setItems(result.items);
  }, []);

  useEffect(() => {
    void loadShares();
  }, [loadShares]);

  const buildShareText = (item: ManagedAlbumShareDTO) => [
    `图集：${item.albumName}`,
    `链接：${item.shareUrl}`,

    `有效期：${new Date(item.expiresAt).toLocaleString('zh-CN')}`
  ].join('\n');

  const handleCopy = async (item: ManagedAlbumShareDTO) => {
    try {
      await navigator.clipboard.writeText(buildShareText(item));
      toast('分享链接已复制；密码不可再次查看', 'success');
    } catch {
      setError('复制失败，请手动复制链接');
    }
  };

  const handleDelete = async (shareId: string) => {
    const success = await deleteManagedAlbumShare(shareId);
    if (!success) {
      setError('删除分享失败');
      return;
    }
    await loadShares();
  };

  const handleReset = async (item: ManagedAlbumShareDTO) => {
    const password = window.prompt('请输入新分享密码（1–128 字符）。保存后旧访问会话立即失效，密码不可再次查看。');
    if (password === null) return;
    if (!password.trim() || password.length > 128) { setError('密码长度必须为 1–128 个字符'); return; }
    try {
      await resetManagedAlbumSharePassword(item.id, password);
      toast('分享密码已重置，旧访问会话已失效', 'success');
    } catch { setError('重置失败，请稍后重试'); }
  };

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden">
      <Sidebar />

      <main className="mp-with-sidebar custom-scrollbar relative h-full flex-1 overflow-y-auto px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] md:px-10 md:pt-9 xl:px-12">
        <GalleryHeader
          eyebrow="Shares"
          title="分享管理"
          description="管理仍在有效期内的图集分享链接"
          aside={isLoading ? <Loader2 className="h-5 w-5 animate-spin text-outline" /> : undefined}
        />

        {error && <div className="mb-4 rounded-lg bg-error/10 px-4 py-3 text-sm text-error">{error}</div>}

        {items.length === 0 && !isLoading ? (
          <div className="mp-glass-panel flex h-64 flex-col items-center justify-center rounded-[18px] text-on-surface-variant">
            <Share2 className="mb-3 h-8 w-8" />
            <p className="font-semibold">还没有活跃分享</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {items.map((item) => (
              <article key={item.id} className="mp-glass-panel grid gap-4 rounded-[16px] p-4 md:grid-cols-[96px_1fr_auto] md:items-center">
                <div className="h-24 overflow-hidden rounded-md bg-surface-container-high">
                  {item.albumCoverUrl ? (
                    <ThrottledImage src={item.albumCoverUrl} alt={item.albumName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-outline/40">
                      <Share2 className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate mp-title text-lg">{item.albumName}</h2>
                  <p className="mt-1 text-sm text-outline">{item.albumAssetCount} 张图片</p>
                  <p className="mt-2 break-all text-xs text-outline/80">{item.shareUrl}</p>
                  <p className="mt-2 text-xs font-semibold text-on-surface">密码仅创建时显示，之后只能重置</p>
                  <p className="mt-2 text-xs text-outline/70">
                    有效期至 {new Date(item.expiresAt).toLocaleString('zh-CN')}
                  </p>
                </div>
                <div className="flex gap-2 md:flex-col">
                  <button
                    type="button"
                    onClick={() => void handleCopy(item)}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container transition-all hover:brightness-95"
                    title="复制链接"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => void handleReset(item)} className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container" title="重置密码">
                    <KeyRound className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(item.id)}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-error/10 text-error transition-all hover:bg-error/20"
                    title="删除分享"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
