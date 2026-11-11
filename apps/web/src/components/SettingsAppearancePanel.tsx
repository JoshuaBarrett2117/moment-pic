import type { FC } from 'react';
import { Check, Palette, Sparkles } from 'lucide-react';
import { useTheme } from '../theme/useTheme';

/** 设置 → 外观：选择主题。偏好只保存在当前浏览器。 */
export const SettingsAppearancePanel: FC = () => {
  const { theme, themes, setTheme } = useTheme();

  return (
    <div>
      <header className="mb-6 md:mb-12">
        <h2 className="text-2xl md:text-4xl font-headline font-bold text-on-surface">外观</h2>
        <p className="text-outline mt-2 text-sm md:text-base">选择界面主题。设置只保存在当前浏览器，切换后立即生效。</p>
      </header>

      <section aria-label="主题" className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        {themes.map((item) => {
          const active = item.id === theme;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => setTheme(item.id)}
              className={`mp-card flex flex-col gap-4 p-4 text-left ${active ? 'border-primary! ring-2 ring-primary/40' : ''}`}
            >
              <div
                aria-hidden="true"
                className="relative h-28 overflow-hidden rounded-xl border border-outline-variant"
                style={{ background: `radial-gradient(60% 80% at 20% 20%, rgba(99,102,241,0.35), transparent 70%), radial-gradient(60% 80% at 90% 90%, rgba(45,212,191,0.25), transparent 70%), ${item.preview.background}` }}
              >
                <div className="absolute left-3 top-3 bottom-3 w-16 rounded-lg border border-white/10" style={{ background: item.preview.surface }} />
                <div className="absolute left-22 right-3 top-3 h-6 rounded-md border border-white/10" style={{ background: item.preview.surface }} />
                <div className="absolute left-22 top-12 h-12 w-12 rounded-md border border-white/10" style={{ background: item.preview.surface }} />
                <div className="absolute left-36 top-12 h-12 w-12 rounded-md border border-white/10" style={{ background: item.preview.surface }} />
                <div className="absolute bottom-3 right-3 h-5 w-14 rounded-full" style={{ background: item.preview.accent }} />
              </div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 font-semibold text-on-surface">
                    <Palette className="h-4 w-4 text-primary" />
                    {item.name}
                  </p>
                  <p className="mt-1 text-sm text-outline">{item.description}</p>
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

        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-outline-variant p-6 text-center text-outline">
          <Sparkles className="h-6 w-6" />
          <p className="text-sm font-medium">更多主题敬请期待</p>
        </div>
      </section>
    </div>
  );
};
