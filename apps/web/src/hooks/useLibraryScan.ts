import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '../lib/api';
import { getScanFailureMessage, SCAN_FAILURE_MESSAGE } from '../lib/scan-status';
import type { ScanResultDTO } from '../types/api';
import { isRequestCancellation } from './useLatestRequest';

type ScanTask = Pick<ScanResultDTO, 'taskId' | 'libraryRootId' | 'status' | 'startedAt' | 'finishedAt' | 'error'>;
type ScanRequest = { controller: AbortController; polling: boolean };
type UseLibraryScanOptions = { onScanComplete?: () => void | Promise<void>; enabled?: boolean };
interface UseLibraryScanReturn {
  scanError: string | null;
  scanningLibraryRootIds: Set<string>;
  isAnyScanning: boolean;
  isScanning: (libraryRootId: string) => boolean;
  scan: (libraryRootId?: string) => Promise<ScanResultDTO | null>;
  clearScanTask: (libraryRootId: string) => void;
}

const SCAN_REQUEST_TIMEOUT_MS = 0;
const SCAN_TASK_STORAGE_KEY = 'moment_pic_active_scan_tasks';
const getTaskKey = (libraryRootId: string | null | undefined): string => libraryRootId ?? 'all';
const isActive = (task: ScanTask): boolean => task.status === 'pending' || task.status === 'running';
const toScanTask = (task: ScanResultDTO): ScanTask => ({
  taskId: task.taskId,
  libraryRootId: task.libraryRootId ?? null,
  status: task.status,
  startedAt: task.startedAt ?? null,
  finishedAt: task.finishedAt ?? null,
  error: task.status === 'failed' ? getScanFailureMessage(task) : null,
});

export function useLibraryScan({ onScanComplete, enabled = true }: UseLibraryScanOptions = {}): UseLibraryScanReturn {
  const [scanTasks, setScanTasks] = useState<Map<string, ScanTask>>(new Map());
  const pollIntervalsRef = useRef(new Map<string, number>());
  const requestsRef = useRef(new Map<string, ScanRequest>());
  const locallyChangedTasksRef = useRef(new Set<string>());
  const mountedRef = useRef(true);
  const onScanCompleteRef = useRef(onScanComplete);
  onScanCompleteRef.current = onScanComplete;
  const scanTaskList = Array.from<ScanTask>(scanTasks.values());
  const isAnyScanning = scanTaskList.some(isActive);
  const scanningLibraryRootIds = new Set(scanTaskList.filter(isActive).map((task) => task.libraryRootId).filter((id): id is string => id !== null));

  const stopTask = useCallback((key: string) => {
    const interval = pollIntervalsRef.current.get(key);
    if (interval !== undefined) window.clearInterval(interval);
    pollIntervalsRef.current.delete(key);
    requestsRef.current.get(key)?.controller.abort();
    requestsRef.current.delete(key);
  }, []);

  const isCurrent = useCallback((key: string, request: ScanRequest): boolean =>
    mountedRef.current && requestsRef.current.get(key) === request && !request.controller.signal.aborted, []);

  const updateTask = useCallback((key: string, task: ScanTask) => {
    setScanTasks((previous) => new Map(previous).set(key, task));
  }, []);

  const startPolling = useCallback((key: string, taskId: string, request: ScanRequest) => {
    let failures = 0;
    const interval = window.setInterval(async () => {
      if (!isCurrent(key, request) || request.polling) return;
      request.polling = true;
      try {
        const task = await api.getWithOptions<ScanResultDTO>(`/scan/${taskId}`, undefined, {
          timeoutMs: SCAN_REQUEST_TIMEOUT_MS, signal: request.controller.signal,
        });
        if (!isCurrent(key, request)) return;
        failures = 0;
        updateTask(key, toScanTask(task));
        if (!isActive(task)) {
          stopTask(key);
          await onScanCompleteRef.current?.();
        }
      } catch (error) {
        if (!isCurrent(key, request) || isRequestCancellation(error)) return;
        failures += 1;
        if (failures >= 3) {
          setScanTasks((previous) => {
            const task = previous.get(key);
            return task ? new Map(previous).set(key, { ...task, status: 'failed', finishedAt: new Date().toISOString(), error: SCAN_FAILURE_MESSAGE }) : previous;
          });
          stopTask(key);
          await onScanCompleteRef.current?.();
        }
      } finally { request.polling = false; }
    }, 2000);
    pollIntervalsRef.current.set(key, interval);
  }, [isCurrent, stopTask, updateTask]);

  const isScanning = useCallback((libraryRootId: string): boolean => {
    const task = scanTasks.get(libraryRootId);
    return task !== undefined && isActive(task);
  }, [scanTasks]);

  const scan = useCallback(async (libraryRootId?: string): Promise<ScanResultDTO | null> => {
    const key = getTaskKey(libraryRootId);
    if (!enabled || requestsRef.current.has(key)) return null;
    locallyChangedTasksRef.current.add(key);
    const request: ScanRequest = { controller: new AbortController(), polling: false };
    requestsRef.current.set(key, request);
    updateTask(key, { taskId: `pending_${Date.now()}`, libraryRootId: libraryRootId ?? null, status: 'pending', startedAt: null, finishedAt: null, error: null });
    try {
      const result = await api.postWithOptions<ScanResultDTO>('/scan', { libraryRootId }, {
        timeoutMs: SCAN_REQUEST_TIMEOUT_MS, signal: request.controller.signal,
      });
      if (!isCurrent(key, request)) return null;
      updateTask(key, toScanTask({ ...result, libraryRootId: result.libraryRootId ?? libraryRootId ?? null }));
      if (isActive(result)) startPolling(key, result.taskId, request);
      else { stopTask(key); await onScanCompleteRef.current?.(); }
      return result;
    } catch (error) {
      if (!isCurrent(key, request) || isRequestCancellation(error)) return null;
      updateTask(key, { taskId: '', libraryRootId: libraryRootId ?? null, status: 'failed', startedAt: null, finishedAt: new Date().toISOString(), error: SCAN_FAILURE_MESSAGE });
      stopTask(key);
      return null;
    }
  }, [enabled, isCurrent, startPolling, stopTask, updateTask]);

  const clearScanTask = useCallback((libraryRootId: string) => {
    const key = getTaskKey(libraryRootId);
    locallyChangedTasksRef.current.add(key);
    stopTask(key);
    setScanTasks((previous) => { const next = new Map(previous); next.delete(key); return next; });
  }, [stopTask]);

  useEffect(() => {
    const activeTasks = scanTaskList.filter(isActive).map(({ libraryRootId, taskId }) => ({ libraryRootId, taskId }));
    if (activeTasks.length) window.localStorage.setItem(SCAN_TASK_STORAGE_KEY, JSON.stringify(activeTasks));
    else window.localStorage.removeItem(SCAN_TASK_STORAGE_KEY);
  }, [scanTasks]);

  useEffect(() => {
    mountedRef.current = true;
    const restore = new AbortController();
    if (!enabled) setScanTasks(new Map());
    else {
      void api.getWithOptions<ScanResultDTO[]>('/scan', undefined, { timeoutMs: SCAN_REQUEST_TIMEOUT_MS, signal: restore.signal }).then((tasks) => {
        if (restore.signal.aborted || !mountedRef.current) return;
        const restored = new Set<string>();
        for (const task of tasks) {
          const key = getTaskKey(task.libraryRootId);
          if (restored.has(key)) continue;
          restored.add(key);
          if (requestsRef.current.has(key) || locallyChangedTasksRef.current.has(key)) continue;
          updateTask(key, toScanTask(task));
          if (isActive(task)) {
            const request: ScanRequest = { controller: new AbortController(), polling: false };
            requestsRef.current.set(key, request);
            startPolling(key, task.taskId, request);
          }
        }
      }).catch(() => undefined);
    }
    return () => {
      mountedRef.current = false;
      restore.abort();
      for (const key of requestsRef.current.keys()) stopTask(key);
      locallyChangedTasksRef.current.clear();
    };
  }, [enabled, startPolling, stopTask, updateTask]);

  return { scanError: scanTaskList.find((task) => task.status === 'failed')?.error ?? null, scanningLibraryRootIds, isAnyScanning, isScanning, scan, clearScanTask };
}
