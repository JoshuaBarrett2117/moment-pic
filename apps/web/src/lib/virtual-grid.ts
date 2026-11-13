/**
 * 按行虚拟化网格的纯计算部分（与 React 无关，便于测试）。
 * 列数规则与 CSS `repeat(auto-fill, minmax(min(100%, X), 1fr))` 一致。
 */

export const computeColumns = (width: number, minItemWidth: number, gap: number): number => {
  if (!(width > 0)) return 1;
  const min = Math.min(Math.max(1, minItemWidth), width);
  return Math.max(1, Math.floor((width + gap) / (min + gap)));
};

export const computeItemWidth = (width: number, columns: number, gap: number): number =>
  columns <= 0 ? 0 : Math.max(0, (width - gap * (columns - 1)) / columns);

/** 每行起点（相对网格顶部），最后一项为总高度。已测量的行用实测高度，其余用估算。 */
export const buildRowOffsets = (
  rowCount: number,
  estimatedRowHeight: number,
  gap: number,
  measured?: ReadonlyMap<number, number>,
): number[] => {
  const offsets = new Array<number>(rowCount + 1);
  let y = 0;
  for (let row = 0; row < rowCount; row += 1) {
    offsets[row] = y;
    y += (measured?.get(row) ?? estimatedRowHeight) + (row < rowCount - 1 ? gap : 0);
  }
  offsets[rowCount] = y;
  return offsets;
};

/** 二分查找：第一个底边在 y 之下的行。 */
const findRowAt = (offsets: number[], rowCount: number, y: number): number => {
  let low = 0;
  let high = rowCount - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (offsets[mid + 1] <= y) low = mid + 1;
    else high = mid;
  }
  return Math.max(0, low);
};

/**
 * 可见行区间 [start, end]（含两端）。viewportTop 为视口顶部相对网格顶部的位置（可为负，网格在视口下方）。
 * overscanPx 为视口上下各额外保留的像素。
 */
export const computeVisibleRows = (input: {
  offsets: number[];
  rowCount: number;
  viewportTop: number;
  viewportHeight: number;
  overscanPx: number;
}): { start: number; end: number } => {
  const { offsets, rowCount, viewportTop, viewportHeight, overscanPx } = input;
  if (rowCount <= 0) return { start: 0, end: -1 };
  const top = viewportTop - overscanPx;
  const bottom = viewportTop + viewportHeight + overscanPx;
  const total = offsets[rowCount];
  if (bottom <= 0) return { start: 0, end: Math.min(rowCount - 1, 0) };
  if (top >= total) return { start: rowCount - 1, end: rowCount - 1 };
  const start = findRowAt(offsets, rowCount, Math.max(0, top));
  const end = findRowAt(offsets, rowCount, Math.min(total - 0.01, bottom));
  return { start, end: Math.max(start, end) };
};
