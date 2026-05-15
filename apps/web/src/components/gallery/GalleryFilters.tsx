import { ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react';

type SortBy = 'name' | 'updatedAt' | 'assetCount' | 'albumCount';
type SourceType = 'folder' | 'zip' | '';

type GalleryFiltersProps = {
  isSmartAlbumsMode: boolean;
  isWideMobile: boolean;
  isFilterExpanded: boolean;
  sortOptions: Array<{ value: SortBy; label: string }>;
  currentKeyword: string;
  currentSortBy: SortBy;
  currentSortOrder: 'asc' | 'desc';
  currentPageSize: number;
  currentSourceType: SourceType;
  onToggleExpanded: () => void;
  onKeywordChange: (keyword: string) => void;
  onSourceTypeChange?: (sourceType: SourceType) => void;
  onSortByChange: (sortBy: SortBy) => void;
  onSortOrderChange: (sortOrder: 'asc' | 'desc') => void;
  onPageSizeChange: (pageSize: number) => void;
  onRefresh: () => void;
};

const pageSizeOptions = [12, 24, 48, 96];

export function GalleryFilters({
  isSmartAlbumsMode,
  isWideMobile,
  isFilterExpanded,
  sortOptions,
  currentKeyword,
  currentSortBy,
  currentSortOrder,
  currentPageSize,
  currentSourceType,
  onToggleExpanded,
  onKeywordChange,
  onSourceTypeChange,
  onSortByChange,
  onSortOrderChange,
  onPageSizeChange,
  onRefresh,
}: GalleryFiltersProps) {
  return (
    <div className="mb-4">
      <button
        onClick={onToggleExpanded}
        className="flex items-center gap-2 rounded-lg bg-surface-container-high px-4 py-2 text-sm md:hidden"
      >
        {isSmartAlbumsMode ? <SlidersHorizontal className="h-4 w-4" /> : null}
        <span>筛选</span>
        <ChevronRight className={`h-4 w-4 transition-transform ${isFilterExpanded ? 'rotate-90' : ''}`} />
      </button>

      <div className={`${isFilterExpanded ? 'block' : 'hidden'} md:block`}>
        <div className={`mb-6 rounded-2xl bg-surface-container-highest p-3 shadow-sm ${isWideMobile ? 'md:mb-8 md:p-4' : 'md:mb-8 md:p-4'}`}>
          <div className="relative mb-3 w-full">
            <input
              className="w-full rounded-full border-2 border-outline/30 bg-surface-container-high py-2 pl-10 pr-10 text-sm outline-none placeholder:text-outline/50 focus:border-transparent focus:ring-2 focus:ring-primary-container"
              placeholder={isSmartAlbumsMode ? '搜索自动整理名称' : '搜索相册名称'}
              type="text"
              value={currentKeyword}
              onChange={(event) => onKeywordChange(event.target.value)}
            />
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
            {currentKeyword && (
              <button
                onClick={() => onKeywordChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-outline transition-colors hover:text-on-surface"
                title="清空搜索"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 md:gap-4">
            {!isSmartAlbumsMode && onSourceTypeChange && (
              <div className="flex items-center gap-2">
                <span className="hidden text-sm text-outline sm:inline">来源:</span>
                <select
                  value={currentSourceType}
                  onChange={(event) => onSourceTypeChange(event.target.value as SourceType)}
                  className="cursor-pointer rounded-lg bg-surface-container-high px-2 py-2 text-sm outline-none md:px-3"
                >
                  <option value="">全部</option>
                  <option value="folder">文件夹</option>
                  <option value="zip">压缩包</option>
                </select>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="hidden text-sm text-outline sm:inline">排序:</span>
              <select
                value={currentSortBy}
                onChange={(event) => onSortByChange(event.target.value as SortBy)}
                className="cursor-pointer rounded-lg bg-surface-container-high px-2 py-2 text-sm outline-none md:px-3"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => onSortOrderChange(currentSortOrder === 'asc' ? 'desc' : 'asc')}
              className="flex items-center gap-1 rounded-lg bg-surface-container-high px-3 py-2 text-sm transition-colors hover:bg-primary-container/20"
            >
              {currentSortOrder === 'asc' ? '正序' : '倒序'}
            </button>

            <div className="flex items-center gap-2">
              <span className="text-sm text-outline">每页:</span>
              <select
                value={currentPageSize}
                onChange={(event) => onPageSizeChange(Number(event.target.value))}
                className="cursor-pointer rounded-lg bg-surface-container-high px-3 py-2 text-sm outline-none"
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => {
                onKeywordChange('');
                onSourceTypeChange?.('');
                onSortByChange('updatedAt');
                onSortOrderChange('desc');
                onPageSizeChange(24);
                onRefresh();
              }}
              className="ml-auto flex items-center gap-1 px-2 py-2 text-sm text-outline transition-colors hover:text-on-surface"
            >
              <X className="h-4 w-4" />
              清空筛选
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
