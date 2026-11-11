import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

type GalleryHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  onBack?: () => void;
  aside?: ReactNode;
};

/** 页面标题：英文眉题 + 标题 + 渐变细线（参考 momentpt.top）。 */
export function GalleryHeader({ eyebrow, title, description, onBack, aside }: GalleryHeaderProps) {
  return (
    <header className="relative z-10 mb-5 flex items-end justify-between gap-4 md:mb-7">
      <div className="min-w-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-3 flex w-fit items-center gap-1 rounded-full mp-glass-panel px-3 py-1.5 text-sm text-on-surface-variant transition-colors hover:text-on-surface"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </button>
        )}
        <p className="mp-eyebrow">{eyebrow}</p>
        <h1 className="mp-title mt-2 truncate text-2xl leading-tight md:text-[30px]">{title}</h1>
        <hr className="mp-rule mt-3" />
        {description && <p className="mt-3 text-sm tracking-[0.03em] text-on-surface-variant">{description}</p>}
      </div>
      {aside}
    </header>
  );
}
