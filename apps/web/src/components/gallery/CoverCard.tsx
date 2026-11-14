import type { ReactNode } from 'react';
import { m } from 'motion/react';
import { ThrottledImage } from '../ThrottledImage';
import { galleryCardItemVariants } from './gallery-card-motion';

type CoverCardProps = {
  title: string;
  meta: ReactNode;
  coverUrl: string | null;
  placeholderIcon: ReactNode;
  /** 左上角小标签（来源、套数等） */
  tag?: ReactNode;
  /** 右上角常驻标记（收藏星标） */
  badge?: ReactNode;
  /** 悬停时出现的操作按钮 */
  actions?: ReactNode;
  /** 封面上方的提示（扫描错误等），显示在卡片外 */
  notice?: ReactNode;
  onOpen: () => void;
  ariaLabel?: string;
  /** 在所属网格中的序号：决定级联入场延迟（只有前 12 张做级联） */
  index?: number;
};

/** 封面铺满的相册卡片：信息叠在底部渐变上，纸感主题自动加相框（--mp-photo-frame）。 */
export function CoverCard({ title, meta, coverUrl, placeholderIcon, tag, badge, actions, notice, onOpen, ariaLabel, index = 0 }: CoverCardProps) {
  return (
    <m.div variants={galleryCardItemVariants} custom={index} className="group">
      {notice}
      <div className="mp-cover-card mp-cv">
        <button
          type="button"
          onClick={onOpen}
          aria-label={ariaLabel ?? title}
          className="block w-full text-left"
        >
          <div className="relative aspect-[4/5] w-full overflow-hidden bg-surface-container-high">
            {coverUrl ? (
              <ThrottledImage
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                src={coverUrl}
                alt={title}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-outline/40">{placeholderIcon}</div>
            )}
            <div className="mp-cover-caption pointer-events-none absolute inset-x-0 bottom-0 px-3.5 pb-3 pt-10">
              <h3 className="truncate text-[15px] font-semibold leading-tight tracking-[0.04em]" title={title}>
                {title}
              </h3>
              <p className="mp-on-photo-2 mt-1 text-xs tabular-nums">{meta}</p>
            </div>
          </div>
        </button>
        {tag && <div className="mp-photo-chip pointer-events-none absolute left-2.5 top-2.5 rounded-full px-2 py-0.5 text-[11px] font-medium">{tag}</div>}
        {badge && <div className={`pointer-events-none absolute right-2.5 top-2.5 transition-opacity duration-200 ${actions ? 'group-hover:opacity-0 group-focus-within:opacity-0 [@media(hover:none)]:opacity-0' : ''}`}>{badge}</div>}
        {actions && (
          <div className="pointer-events-none absolute right-2.5 top-2.5 flex gap-2 opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
            {actions}
          </div>
        )}
      </div>
    </m.div>
  );
}
