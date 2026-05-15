export const clampGridWidth = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 160;
  }

  return Math.max(180, Math.min(600, Math.round(value)));
};

export const formatLibraryRootScanTime = (dateStr: string | null): string => {
  if (!dateStr) {
    return '从未扫描';
  }

  return new Date(dateStr).toLocaleString('zh-CN');
};
