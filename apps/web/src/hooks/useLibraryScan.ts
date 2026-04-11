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

export function useLibraryScan(): UseLibraryScanReturn {
  const [scanTasks, setScanTasks] = useState<Map<string, ScanTask>>(new Map());
  const pollIntervalsRef = useRef<Map<string, number>>(new Map());
  const isAnyScanning = Array.from(scanTasks.values()).some(
    (task) => task.status === 'running' || task.status === 'pending'
  );

  const scanningLibraryRootIds = new Set(
    Array.from(scanTasks.values())
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
  }, []);

  const startPolling = useCallback((libraryRootId: string, taskId: string) => {
    clearPollInterval(libraryRootId);

    const intervalId = window.setInterval(async () => {
      try {
        const status = await api.get<ScanResultDTO>(`/scan/${taskId}`);
        
        setScanTasks(prev => {
          const next = new Map(prev);
          const task = next.get(libraryRootId);
          if (task) {
            next.set(libraryRootId, {
              ...task,
              status: status.status,
              finishedAt: status.finishedAt ?? null,
              error: status.error ?? null
            });
          }
          return next;
        });

        if (status.status === 'completed' || status.status === 'failed') {
          clearPollInterval(libraryRootId);
        }
      } catch {
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

    setScanTasks(prev => {
      const next = new Map(prev);
      next.set(key, newTask);
      return next;
    });

    try {
      const result = await api.post<ScanResultDTO>('/scan', { libraryRootId });
      
      setScanTasks(prev => {
        const next = new Map(prev);
        const task = next.get(key);
        if (task) {
          next.set(key, {
            ...task,
            status: 'running',
            startedAt: result.startedAt ?? new Date().toISOString()
          });
        }
        return next;
      });

      startPolling(key, result.taskId);
      return result;
    } catch (err) {
      setScanTasks(prev => {
        const next = new Map(prev);
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
    setScanTasks(prev => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, [clearPollInterval]);

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
