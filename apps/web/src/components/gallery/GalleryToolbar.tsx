import { useEffect, useRef } from 'react';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, LayoutGrid, Search, X } from 'lucide-react';
import { consumeGallerySearchFocus, GALLERY_SEARCH_EVENT } from '../../app/gallery-search';
import { CARD_SIZE_LABEL, type CardSize } from './card-size';

type SortBy = 'name' | 'updatedAt' | 'assetCount' | 'albumCount';
type SourceType = 'folder' | 'zip' | '';

type GalleryToolbarProps = {
  isSmartAlbumsMode: boolean;
  isCompact: boolean;
  sortOptions: Array<{ value: SortBy; label: string }>;
  currentKeyword: string;
  currentSortBy: SortBy;
  currentSortOrder: 'asc' | 'desc';
  currentSourceType: SourceType;
  total: number | null;
  hasActiveFilters: boolean;
  cardSize: CardSize;
  onCardSizeChange: (size: CardSize) => void;
  onKeywordChange: (keyword: string) => void;
  onSourceTypeChange?: (sourceType: SourceType) => void;
  onSortByChange: (sortBy: SortBy) => void;
  onSortOrderChange: (sortOrder: 'asc' | 'desc') => void;
  onReset: () => void;
};

const SOURCE_OPTIONS: Array<{ value: SourceType; label: string }> = [
  { value: '', label: '全部' },
  { value: 'folder', label: '文件夹' },
  { value: 'zip', label: '压缩包' },
];
const CARD_SIZES: CardSize[] = ['large', 'medium', 'small'];

/** 吸顶玻璃工具栏：来源胶囊、结果内搜索、排序（含升降序）、卡片尺寸。 */
export function GalleryToolbar({
  isSmartAlbumsMode,
  isCompact,
  sortOptions,
  currentKeyword,
  currentSortBy,
  currentSortOrder,
  currentSourceType,
  total,
  hasActiveFilters,
  cardSize,
  onCardSizeChange,
  onKeywordChange,
  onSourceTypeChange,
  onSortByChange,
  onSortOrderChange,
  onReset,
}: GalleryToolbarProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const focus = () => {
      if (consumeGallerySearchFocus()) inputRef.current?.focus();
    };
    focus();
    window.addEventListener(GALLERY_SEARCH_EVENT, focus);
    return () => window.removeEventListener(GALLERY_SEARCH_EVENT, focus);
  }, []);

  const search = (
    <label className={`mp-field flex h-9 items-center gap-2 px-3 ${isCompact ? 'w-full' : 'w-56 lg:w-64'}`}>
      <Search className="h-4 w-4 shrink-0 text-outline" />
      <input
        ref={inputRef}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        placeholder={isSmartAlbumsMode ? '搜索智能相册' : '搜索相册名称'}
        type="search"
        value={currentKeyword}
        onChange={(event) => onKeywordChange(event.target.value)}
        aria-label="搜索"
      />
      {currentKeyword && (
        <button type="button" onClick={() => onKeywordChange('')} className="text-outline hover:text-on-surface" title="清空搜索" aria-label="清空搜索">
          <X className="h-4 w-4" />
        </button>
      )}
    </label>
  );

  return (
    <div className="sticky top-0 z-20 -mx-1 mb-5 px-1 pt-1">
      <div className="mp-glass-panel flex flex-wrap items-center gap-2 rounded-[14px] p-2">
        {isCompact && search}
        {!isSmartAlbumsMode && onSourceTypeChange && (
          <div role="radiogroup" aria-label="来源" className="flex items-center gap-1">
            {SOURCE_OPTIONS.map((option) => {
              const active = currentSourceType === option.value;
              return (
                <button
                  key={option.value || 'all'}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onSourceTypeChange(option.value)}
                  className={`h-8 rounded-full border px-3 text-[13px] transition-colors ${
                    active ? 'border-primary/40 bg-primary-container text-on-surface' : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {option.label}
                  {active && total !== null && <span className="ml-1.5 tabular-nums text-outline">{total}</span>}
                </button>
              );
            })}
          </div>
        )}
        {(isSmartAlbumsMode || !onSourceTypeChange) && total !== null && (
          <span className="px-2 text-[13px] text-on-surface-variant">共 <span className="tabular-nums">{total}</span> 个</span>
        )}

        <span className="flex-1" />
        {!isCompact && search}

        <div className="flex items-center overflow-hidden rounded-[10px] border border-outline-variant bg-surface-container-lowest">
          <select
            value={currentSortBy}
            onChange={(event) => onSortByChange(event.target.value as SortBy)}
            className="h-8 cursor-pointer bg-transparent pl-3 pr-1 text-[13px] outline-none"
            aria-label="排序方式"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onSortOrderChange(currentSortOrder === 'asc' ? 'desc' : 'asc')}
            className="flex h-8 w-8 items-center justify-center border-l border-outline-variant text-on-surface-variant hover:text-on-surface"
            title={currentSortOrder === 'asc' ? '正序（点击切换为倒序）' : '倒序（点击切换为正序）'}
            aria-label={currentSortOrder === 'asc' ? '当前正序' : '当前倒序'}
          >
            {currentSortOrder === 'asc' ? <ArrowUpNarrowWide className="h-4 w-4" /> : <ArrowDownWideNarrow className="h-4 w-4" />}
          </button>
        </div>

        <div role="radiogroup" aria-label="卡片尺寸" className="flex items-center rounded-[10px] border border-outline-variant bg-surface-container-lowest p-0.5">
          <LayoutGrid className="mx-1.5 h-3.5 w-3.5 text-outline" aria-hidden="true" />
          {CARD_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              role="radio"
              aria-checked={cardSize === size}
              onClick={() => onCardSizeChange(size)}
              className={`h-7 w-7 rounded-[8px] text-xs transition-colors ${cardSize === size ? 'bg-primary-container text-on-surface' : 'text-on-surface-variant hover:text-on-surface'}`}
            >
              {CARD_SIZE_LABEL[size]}
            </button>
          ))}
        </div>

        {hasActiveFilters && (
          <button type="button" onClick={onReset} className="flex h-8 items-center gap-1 rounded-[10px] px-2 text-[13px] text-outline transition-colors hover:text-on-surface">
            <X className="h-3.5 w-3.5" />
            重置
          </button>
        )}
      </div>
    </div>
  );
}
