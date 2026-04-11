import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '../lib/api';
import type { ScanResultDTO } from '../types/api';

interface UseScanReturn {
  scan: (libraryRootId?: string) => Promise<ScanResultDTO | null>;
  getScanStatus: (taskId: string) => Promise<ScanResultDTO | null>;
  currentScanTask: ScanResultDTO | null;
  isScanning: boolean;
}

export function useScan(): UseScanReturn {
  const [currentScanTask, setCurrentScanTask] = useState<ScanResultDTO | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const pollIntervalRef = useRef<number | null>(null);

  const startPolling = useCallback((taskId: string) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    pollIntervalRef.current = window.setInterval(async () => {
      try {
        const status = await api.get<ScanResultDTO>(`/scan/${taskId}`);
        setCurrentScanTask(status);

        if (status.status === 'completed' || status.status === 'failed') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setIsScanning(false);
        }
      } catch {
        // ignore polling errors
      }
    }, 2000);
  }, []);

  const scan = useCallback(async (libraryRootId?: string): Promise<ScanResultDTO | null> => {
    setIsScanning(true);
    try {
      const result = await api.post<ScanResultDTO>('/scan', { libraryRootId });
      setCurrentScanTask(result);
      startPolling(result.taskId);
      return result;
    } catch (err) {
      setIsScanning(false);
      return null;
    }
  }, [startPolling]);

  const getScanStatus = useCallback(async (taskId: string): Promise<ScanResultDTO | null> => {
    try {
      const status = await api.get<ScanResultDTO>(`/scan/${taskId}`);
      return status;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  return { scan, getScanStatus, currentScanTask, isScanning };
}
