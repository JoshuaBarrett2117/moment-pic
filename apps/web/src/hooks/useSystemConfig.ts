import { useState, useCallback } from 'react';
import { api } from '../lib/api';
import type { PageTransitionModeDTO, SystemConfigDTO } from '../types/api';

export type SystemConfigUpdates = {
  enablePolling?: boolean;
  pollingInterval?: number;
  preloadBefore?: number;
  preloadAfter?: number;
  defaultImageQualityPreset?: "low" | "balanced" | "high" | "original";
  pageTransitionMode?: PageTransitionModeDTO;
  albumListItemMinWidthMobile?: number;
  albumListItemMinWidthDesktop?: number;
  albumDetailItemMinWidthMobile?: number;
  albumDetailItemMinWidthDesktop?: number;
};

interface UseSystemConfigReturn {
  systemConfig: SystemConfigDTO | null;
  isLoading: boolean;
  error: string | null;
  fetchSystemConfig: () => Promise<void>;
  updateSystemConfig: (updates: SystemConfigUpdates) => Promise<SystemConfigDTO | null>;
}

export function useSystemConfig(): UseSystemConfigReturn {
  const [systemConfig, setSystemConfig] = useState<SystemConfigDTO | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSystemConfig = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<SystemConfigDTO>('/system-config');
      setSystemConfig(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取系统配置失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateSystemConfig = useCallback(async (updates: SystemConfigUpdates): Promise<SystemConfigDTO | null> => {
    setError(null);
    try {
      const result = await api.patch<SystemConfigDTO>('/system-config', updates);
      setSystemConfig(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新系统配置失败');
      return null;
    }
  }, []);

  return { systemConfig, isLoading, error, fetchSystemConfig, updateSystemConfig };
}
