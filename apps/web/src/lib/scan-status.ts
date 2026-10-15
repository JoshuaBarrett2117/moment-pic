import type { ScanResultDTO } from '../types/api';

export const SCAN_FAILURE_MESSAGE = '扫描失败，已保留原索引，请检查媒体目录后重试';
export const SCAN_PARTIAL_FAILURE_MESSAGE = '部分扫描失败，已跳过清理，请检查媒体目录后重试';

export const getScanFailureMessage = (task: Pick<ScanResultDTO, 'outcome' | 'albumsDiscovered'>): string =>
  task.outcome === 'partial' || task.albumsDiscovered > 0 ? SCAN_PARTIAL_FAILURE_MESSAGE : SCAN_FAILURE_MESSAGE;
