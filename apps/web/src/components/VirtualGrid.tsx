import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { buildRowOffsets, computeColumns, computeItemWidth, computeVisibleRows } from '../lib/virtual-grid';

type VirtualGridProps<T> = {
  items: readonly T[];
  getKey: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  /** 与 CSS minmax(min(100%, X), 1fr) 的 X 一致 */
  minItemWidth: number;
  gap: number;
  /** 由单元宽度估算一行高度（不含行间距）；实际高度渲染后会实测修正 */
  estimateRowHeight: (itemWidth: number) => number;
  /** 滚动容器 */
  scrollElementRef: RefObject<HTMLElement | null>;
  /** 视口上下各额外保留几屏，默认 1（共约 3 屏） */
  overscanScreens?: number;
  /** 宽度尚未测得（首帧、无 DOM 的测试环境）时按普通网格渲染的条数 */
  initialCount?: number;
  className?: string;
  ariaLabel?: string;
};

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * 按行虚拟化的网格：只渲染视口前后约 overscanScreens 屏的行，其余用总高度占位。
 * 每行绝对定位；行高按估算值占位，渲染后用 ResizeObserver 实测修正。
 */
export function VirtualGrid<T>({
  items,
  getKey,
  renderItem,
  minItemWidth,
  gap,
  estimateRowHeight,
  scrollElementRef,
  overscanScreens = 1,
  initialCount = 48,
  className,
  ariaLabel,
}: VirtualGridProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [viewport, setViewport] = useState({ top: 0, height: 0 });
  const [measuredVersion, setMeasuredVersion] = useState(0);
  const measuredRef = useRef(new Map<number, number>());

  const columns = computeColumns(width, minItemWidth, gap);
  const itemWidth = computeItemWidth(width, columns, gap);
  const rowCount = Math.ceil(items.length / columns);
  const estimatedRowHeight = Math.max(1, estimateRowHeight(itemWidth));

  // 列数或单元宽度变化后，旧的行高实测全部作废
  const layoutKey = `${columns}:${Math.round(itemWidth)}`;
  const layoutKeyRef = useRef(layoutKey);
  if (layoutKeyRef.current !== layoutKey) {
    layoutKeyRef.current = layoutKey;
    measuredRef.current = new Map();
  }

  const offsets = useMemo(
    () => buildRowOffsets(rowCount, estimatedRowHeight, gap, measuredRef.current),
    // measuredVersion 驱动重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rowCount, estimatedRowHeight, gap, layoutKey, measuredVersion],
  );

  const readViewport = useCallback(() => {
    const container = containerRef.current;
    const scroller = scrollElementRef.current;
    if (!container || !scroller) return;
    const top = scroller.getBoundingClientRect().top - container.getBoundingClientRect().top;
    const height = scroller.clientHeight;
    setViewport((prev) => (Math.abs(prev.top - top) < 1 && prev.height === height ? prev : { top, height }));
  }, [scrollElementRef]);

  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setWidth(container.clientWidth);
    readViewport();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      setWidth(container.clientWidth);
      readViewport();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [readViewport]);

  useEffect(() => {
    const scroller = scrollElementRef.current;
    if (!scroller) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        readViewport();
      });
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [readViewport, scrollElementRef]);

  // 行高实测
  const rowObserverRef = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    let pending = false;
    const observer = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const row = Number((entry.target as HTMLElement).dataset.row);
        const height = (entry.target as HTMLElement).offsetHeight;
        if (!Number.isFinite(row) || height <= 0) continue;
        if (measuredRef.current.get(row) !== height) {
          measuredRef.current.set(row, height);
          changed = true;
        }
      }
      if (changed && !pending) {
        pending = true;
        requestAnimationFrame(() => {
          pending = false;
          setMeasuredVersion((value) => value + 1);
        });
      }
    });
    rowObserverRef.current = observer;
    return () => {
      observer.disconnect();
      rowObserverRef.current = null;
    };
  }, []);

  // React 19：ref 回调返回的清理函数在节点卸载时调用，避免 ResizeObserver 持有已移除的行
  const observeRow = useCallback((node: HTMLDivElement | null) => {
    const observer = rowObserverRef.current;
    if (!node || !observer) return;
    observer.observe(node);
    return () => observer.unobserve(node);
  }, []);

  const gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;

  if (width <= 0) {
    // 首帧或无布局环境：普通网格渲染前若干项，测得宽度后切换为虚拟化
    return (
      <div
        ref={containerRef}
        className={className}
        aria-label={ariaLabel}
        style={{ display: 'grid', gap, gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${minItemWidth}px), 1fr))` }}
      >
        {items.slice(0, initialCount).map((item, index) => (
          <div key={getKey(item)}>{renderItem(item, index)}</div>
        ))}
      </div>
    );
  }

  const overscanPx = Math.max(viewport.height, 400) * overscanScreens;
  const { start, end } = computeVisibleRows({
    offsets,
    rowCount,
    viewportTop: viewport.top,
    viewportHeight: viewport.height || 800,
    overscanPx,
  });

  const rows: ReactNode[] = [];
  for (let row = start; row <= end; row += 1) {
    const from = row * columns;
    const rowItems = items.slice(from, from + columns);
    rows.push(
      <div
        key={row}
        ref={observeRow}
        data-row={row}
        role="presentation"
        style={{ position: 'absolute', top: offsets[row], left: 0, right: 0, display: 'grid', gap, gridTemplateColumns, alignItems: 'start' }}
      >
        {rowItems.map((item, offset) => (
          <div key={getKey(item)}>{renderItem(item, from + offset)}</div>
        ))}
      </div>,
    );
  }

  return (
    <div
      ref={containerRef}
      className={className}
      aria-label={ariaLabel}
      data-virtual-grid=""
      data-rendered-rows={end - start + 1}
      style={{ position: 'relative', height: offsets[rowCount] ?? 0 }}
    >
      {rows}
    </div>
  );
}
