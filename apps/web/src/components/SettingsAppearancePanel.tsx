import { type FC, useEffect, useRef, useState } from 'react';
import { Check, ImageOff, ImagePlus, Images, Loader2, Palette, Trash2, Upload } from 'lucide-react';
import { useTheme } from '../theme/useTheme';
import { useBackground, type BackgroundMode } from '../theme/background';
import { userBackgroundApi, validateBackgroundFile, type UserBackgroundDTO } from '../lib/user-background';
import { useToast } from './Toast';

const DEFAULT_PREVIEW = '/backgrounds/photo-wall-960.webp';

/** 设置 → 外观：主题与背景图。主题和“用哪种背景”只保存在当前浏览器；自定义图片按账号保存在服务器。 */
export const SettingsAppearancePanel: FC = () => {
  const { theme, themes, setTheme } = useTheme();
  const background = useBackground();
  const { toast } = useToast();
  const [custom, setCustom] = useState<UserBackgroundDTO | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void userBackgroundApi.meta(controller.signal).then((meta) => {
      if (controller.signal.aborted) return;
      setCustom(meta);
      background.setCustomUrl(meta?.url ?? null);
    }).catch(() => undefined);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const invalid = validateBackgroundFile(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError('');
    setIsUploading(true);
    try {
      const result = await userBackgroundApi.upload(file);
      setCustom(result);
      background.setCustomUrl(result.url);
      background.setMode('custom');
      toast('背景图已更新');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '上传失败，请稍后重试');
    } finally {
      setIsUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    if (!confirm('删除自定义背景图？删除后改用默认照片墙。')) return;
    setIsRemoving(true);
    try {
      await userBackgroundApi.remove();
      setCustom(null);
      background.setCustomUrl(null);
      if (background.mode === 'custom') background.setMode('default');
    } catch {
      setError('删除失败，请稍后重试');
    } finally {
      setIsRemoving(false);
    }
  };

  const options: Array<{ id: BackgroundMode; label: string; hint: string; preview: string | null; disabled?: boolean }> = [
    { id: 'default', label: '默认照片墙', hint: '压暗的照片墙', preview: DEFAULT_PREVIEW },
    { id: 'custom', label: '我的图片', hint: custom ? `${custom.width}×${custom.height}` : '先上传一张图片', preview: custom?.url ?? null, disabled: !custom },
    { id: 'none', label: '不用图片', hint: '只用主题底色', preview: null },
  ];

  return (
    <div className="max-w-4xl">
      <header className="mb-6 md:mb-8">
        <h2 className="mp-title text-xl md:text-2xl">外观</h2>
        <p className="mt-2 text-sm text-on-surface-variant">主题和背景选择只保存在当前浏览器；上传的背景图跟着账号走，换设备也在。</p>
      </header>

      <section aria-label="主题" className="mb-10">
        <h3 className="mp-eyebrow mb-3">Theme · 主题</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {themes.map((item) => {
            const active = item.id === theme;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => setTheme(item.id)}
                className={`mp-card flex flex-col gap-3 p-3 text-left ${active ? 'border-primary! ring-2 ring-primary/40' : ''}`}
              >
                <div aria-hidden="true" className="relative h-28 overflow-hidden rounded-[10px] border border-outline-variant" style={{ background: item.preview.background }}>
                  <div className="absolute inset-0 bg-cover bg-center opacity-90" style={{ backgroundImage: `url(${DEFAULT_PREVIEW})` }} />
                  <div className="absolute inset-0" style={{ background: item.preview.overlay }} />
                  <div className="absolute bottom-2.5 left-2.5 top-2.5 w-14 rounded-md border border-white/15" style={{ background: item.preview.surface }} />
                  <div className="absolute left-20 right-2.5 top-3 h-2 w-16 rounded-full" style={{ background: item.preview.text, opacity: 0.8 }} />
                  <div className="absolute left-20 top-8 grid grid-cols-3 gap-1.5">
                    {[0, 1, 2].map((key) => (
                      <div key={key} className="h-12 w-9 rounded border border-white/15" style={{ background: item.preview.surface }} />
                    ))}
                  </div>
                  <div className="absolute bottom-2.5 right-2.5 h-4 w-12 rounded-full" style={{ background: item.preview.accent }} />
                </div>
                <div className="flex items-start justify-between gap-3 px-1 pb-1">
                  <div>
                    <p className="flex items-center gap-2 font-semibold text-on-surface">
                      <Palette className="h-4 w-4 text-primary" />
                      {item.name}
                      <span className="rounded-full border border-outline-variant px-1.5 text-[10px] font-normal text-on-surface-variant">{item.colorScheme === 'dark' ? '深色' : '浅色'}</span>
                    </p>
                    <p className="mt-1 text-sm text-on-surface-variant">{item.description}</p>
                  </div>
                  {active && (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">
                      <Check className="h-4 w-4" />
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-label="背景图">
        <h3 className="mp-eyebrow mb-3">Background · 背景</h3>
        <div role="radiogroup" aria-label="背景图" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {options.map((option) => {
            const active = background.mode === option.id && !(option.id === 'custom' && !custom);
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={option.disabled}
                onClick={() => background.setMode(option.id)}
                className={`mp-card flex flex-col gap-2.5 p-2.5 text-left disabled:cursor-not-allowed disabled:opacity-60 ${active ? 'border-primary! ring-2 ring-primary/40' : ''}`}
              >
                <div className="relative aspect-video overflow-hidden rounded-[10px] border border-outline-variant bg-background">
                  {option.preview ? (
                    <img src={option.preview} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-outline">
                      {option.id === 'custom' ? <ImagePlus className="h-7 w-7" /> : <ImageOff className="h-7 w-7" />}
                    </div>
                  )}
                  {active && (
                    <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-on-primary">
                      <Check className="h-4 w-4" />
                    </span>
                  )}
                </div>
                <div className="px-1 pb-0.5">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-on-surface">
                    {option.id === 'default' && <Images className="h-4 w-4 text-primary" />}
                    {option.label}
                  </p>
                  <p className="text-xs text-on-surface-variant">{option.hint}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="hidden"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={isUploading}
            className="flex h-10 items-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {custom ? '更换图片' : '上传背景图'}
          </button>
          {custom && (
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={isRemoving}
              className="flex h-10 items-center gap-2 rounded-[10px] border border-outline-variant px-4 text-sm text-on-surface-variant transition-colors hover:text-error disabled:opacity-60"
            >
              {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              删除我的图片
            </button>
          )}
          <p className="text-xs text-on-surface-variant">JPG、PNG、WebP 或 AVIF，最大 15 MB。会自动转成 WebP、去掉拍摄位置等信息，长边最多 2560 像素。</p>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-error">{error}</p>}
      </section>
    </div>
  );
};
