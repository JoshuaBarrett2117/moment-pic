import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '../lib/api';
import type { ScanResultDTO } from '../types/api';

interface ScanTask {
  taskId: string;
  libraryRootId: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

interface UseLibraryScanReturn {
  scanningLibraryRootIds: Set<string>;
  isAnyScanning: boolean;
  isScanning: (libraryRootId: string) => boolean;
  scan: (libraryRootId?: string) => Promise<ScanResultDTO | null>;
  clearScanTask: (libraryRootId: string) => void;
}

type UseLibraryScanOptions = {
  onScanComplete?: () => void | Promise<void>;
};

const SCAN_REQUEST_TIMEOUT_MS = 0;
const SCAN_TASK_STORAGE_KEY = 'moment_pic_active_scan_tasks';

type PersistedScanTask = {
  libraryRootId: string | null;
  taskId: string;
};

const getTaskKey = (libraryRootId: string | null | undefined): string => libraryRootId ?? 'all';

const loadPersistedScanTasks = (): PersistedScanTask[] => {
  try {
    const raw = window.localStorage.getItem(SCAN_TASK_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is PersistedScanTask => {
      if (typeof item !== 'object' || item === null) {
        return false;
      }

      const candidate = item as { taskId?: unknown; libraryRootId?: unknown };
      return typeof candidate.taskId === 'string' && (candidate.libraryRootId === null || typeof candidate.libraryRootId === 'string');
    });
  } catch {
    return [];
  }
};

export function useLibraryScan(options: UseLibraryScanOptions = {}): UseLibraryScanReturn {
  const [scanTasks, setScanTasks] = useState<Map<string, ScanTask>>(new Map<string, ScanTask>());
  const pollIntervalsRef = useRef<Map<string, number>>(new Map<string, number>());
  const pollFailureCountRef = useRef<Map<string, number>>(new Map<string, number>());
  const onScanCompleteRef = useRef(options.onScanComplete);
  onScanCompleteRef.current = options.onScanComplete;
  const scanTaskList = Array.from(scanTasks.values()) as ScanTask[];
  const isAnyScanning = scanTaskList.some(
    (task) => task.status === 'running' || task.status === 'pending'
  );

  const scanningLibraryRootIds = new Set(
    scanTaskList
      .filter(task => task.status === 'running' || task.status === 'pending')
      .map(task => task.libraryRootId ?? '')
      .filter(id => id !== '')
  );

  const isScanning = useCallback((libraryRootId: string): boolean => {
    const task = scanTasks.get(libraryRootId);
    return task !== undefined && (task.status === 'running' || task.status === 'pending');
  }, [scanTasks]);

  const clearPollInterval = useCallback((libraryRootId: string) => {
    const intervalId = pollIntervalsRef.current.get(libraryRootId);
    if (intervalId) {
      clearInterval(intervalId);
      pollIntervalsRef.current.delete(libraryRootId);
    }
    pollFailureCountRef.current.delete(libraryRootId);
  }, []);

  useEffect(() => {
    const persistedTasks = (Array.from(scanTasks.values()) as ScanTask[])
      .filter((task) => task.status === 'running' || task.status === 'pending')
      .map((task) => ({
        libraryRootId: task.libraryRootId,
        taskId: task.taskId
      }));

    if (persistedTasks.length > 0) {
      window.localStorage.setItem(SCAN_TASK_STORAGE_KEY, JSON.stringify(persistedTasks));
      return;
    }

    window.localStorage.removeItem(SCAN_TASK_STORAGE_KEY);
  }, [scanTasks]);

  const startPolling = useCallback((libraryRootId: string, taskId: string) => {
    clearPollInterval(libraryRootId);

    const intervalId = window.setInterval(async () => {
      try {
        const status = await api.getWithOptions<ScanResultDTO>(`/scan/${taskId}`, undefined, {
          timeoutMs: SCAN_REQUEST_TIMEOUT_MS
        });
        pollFailureCountRef.current.set(libraryRootId, 0);
        
        setScanTasks((prev: Map<string, ScanTask>) => {
          const next = new Map<string, ScanTask>(prev);
          next.set(libraryRootId, {
            taskId: status.taskId,
            libraryRootId: status.libraryRootId,
            status: status.status,
            startedAt: status.startedAt ?? null,
            finishedAt: status.finishedAt ?? null,
            error: status.error ?? null
          });
          return next;
        });

        if (status.status === 'completed' || status.status === 'failed') {
          clearPollInterval(libraryRootId);
        }
        if (status.status === 'completed') {
          void onScanCompleteRef.current?.();
        }
      } catch (error) {
        const failureCount = (pollFailureCountRef.current.get(libraryRootId) ?? 0) + 1;
        pollFailureCountRef.current.set(libraryRootId, failureCount);

        if (failureCount < 3) {
          return;
        }

        setScanTasks((prev: Map<string, ScanTask>) => {
          const next = new Map<string, ScanTask>(prev);
          const task = next.get(libraryRootId);
          if (task) {
            next.set(libraryRootId, {
              ...task,
              status: 'failed',
              finishedAt: new Date().toISOString(),
              error: error instanceof Error ? error.message : 'scan polling failed'
            });
          }
          return next;
        });
        clearPollInterval(libraryRootId);
      }
    }, 2000);

    pollIntervalsRef.current.set(libraryRootId, intervalId);
  }, [clearPollInterval]);

  const scan = useCallback(async (libraryRootId?: string): Promise<ScanResultDTO | null> => {
    const key = libraryRootId ?? 'all';
    
    if (isScanning(key)) {
      return null;
    }

    const taskId = `scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    const newTask: ScanTask = {
      taskId,
      libraryRootId: libraryRootId ?? null,
      status: 'pending',
      startedAt: null,
      finishedAt: null,
      error: null
    };

    setScanTasks((prev: Map<string, ScanTask>) => {
      const next = new Map<string, ScanTask>(prev);
      next.set(key, newTask);
      return next;
    });

    try {
      const result = await api.postWithOptions<ScanResultDTO>('/scan', { libraryRootId }, {
        timeoutMs: SCAN_REQUEST_TIMEOUT_MS
      });
      
      setScanTasks((prev: Map<string, ScanTask>) => {
        const next = new Map<string, ScanTask>(prev);
        next.set(key, {
          taskId: result.taskId,
          libraryRootId: result.libraryRootId,
          status: result.status,
          startedAt: result.startedAt ?? new Date().toISOString(),
          finishedAt: result.finishedAt ?? null,
          error: result.error ?? null
        });
        return next;
      });

      startPolling(key, result.taskId);
      return result;
    } catch (err) {
      setScanTasks((prev: Map<string, ScanTask>) => {
        const next = new Map<string, ScanTask>(prev);
        const task = next.get(key);
        if (task) {
          next.set(key, {
            ...task,
            status: 'failed',
            finishedAt: new Date().toISOString(),
            error: err instanceof Error ? err.message : 'scan failed'
          });
        }
        return next;
      });
      return null;
    }
  }, [isScanning, startPolling]);

  const clearScanTask = useCallback((libraryRootId: string) => {
    const key = libraryRootId ?? 'all';
    clearPollInterval(key);
    setScanTasks((prev: Map<string, ScanTask>) => {
      const next = new Map<string, ScanTask>(prev);
      next.delete(key);
      return next;
    });
  }, [clearPollInterval]);

  useEffect(() => {
    const restoreScanTasks = async () => {
      try {
        const serverTasks = await api.getWithOptions<ScanResultDTO[]>('/scan', undefined, {
          timeoutMs: SCAN_REQUEST_TIMEOUT_MS
        });
        const activeTasks = serverTasks
          .filter((task) => task.status === 'pending' || task.status === 'running');

        if (activeTasks.length === 0) {
          return;
        }

        setScanTasks((prev: Map<string, ScanTask>) => {
          const next = new Map<string, ScanTask>(prev);
          for (const serverTask of activeTasks) {
            next.set(getTaskKey(serverTask.libraryRootId), {
              taskId: serverTask.taskId,
              libraryRootId: serverTask.libraryRootId,
              status: serverTask.status,
              startedAt: serverTask.startedAt ?? null,
              finishedAt: serverTask.finishedAt ?? null,
              error: serverTask.error ?? null
            });
          }
          return next;
        });

        for (const serverTask of activeTasks) {
          startPolling(getTaskKey(serverTask.libraryRootId), serverTask.taskId);
        }
      } catch {
        return;
      }
    };

    void restoreScanTasks();
  }, [startPolling]);

  useEffect(() => {
    return () => {
      pollIntervalsRef.current.forEach(intervalId => clearInterval(intervalId));
    };
  }, []);

  return { 
    scanningLibraryRootIds, 
    isAnyScanning,
    isScanning, 
    scan, 
    clearScanTask 
  };
}
