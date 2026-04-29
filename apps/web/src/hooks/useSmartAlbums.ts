import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type {
  SmartAlbumAiConfigDTO,
  SmartAlbumAiConnectionTestDTO,
  SmartAlbumDetailDTO,
  SmartAlbumMemberDTO,
  SmartAlbumMembersListDTO,
  SmartAlbumRebuildTaskDTO,
  SmartAlbumRuleDTO,
  SmartAlbumRuleListDTO,
  SmartAlbumRuleTestResultDTO,
  SmartAlbumsListDTO
} from '../types/api';

type SmartAlbumRuleUpsertInput = Omit<SmartAlbumRuleDTO, 'id' | 'createdAt' | 'updatedAt'>;
type SmartAlbumAiConfigUpdateInput = {
  enabled: boolean;
  mode: SmartAlbumAiConfigDTO['mode'];
  provider: 'openai';
  apiEndpoint: string;
  apiModel: string;
  apiToken?: string | null;
  minConfidenceAutoApply: number;
  minClusterAlbumCount: number;
  maxSuggestionsPerRun: number;
  allowAliasMerge: boolean;
  allowCrossRootGrouping: boolean;
  excludedTokens: string[];
  preferredScopes: SmartAlbumAiConfigDTO['preferredScopes'];
  reviewRequiredBelowConfidence: number;
};

type SmartAlbumAiConnectionTestInput = {
  provider?: 'openai';
  apiEndpoint?: string;
  apiModel?: string;
  apiToken?: string | null;
};

type UseSmartAlbumsOptions = {
  onRebuildComplete?: (task: SmartAlbumRebuildTaskDTO) => void | Promise<void>;
};

const SMART_ALBUM_REBUILD_TASK_STORAGE_KEY = 'moment_pic_active_smart_album_rebuild_task';

export function useSmartAlbums(options: UseSmartAlbumsOptions = {}) {
  const [smartAlbums, setSmartAlbums] = useState<SmartAlbumsListDTO | null>(null);
  const [smartAlbumDetail, setSmartAlbumDetail] = useState<SmartAlbumDetailDTO | null>(null);
  const [smartAlbumMembers, setSmartAlbumMembers] = useState<SmartAlbumMemberDTO[] | null>(null);
  const [rules, setRules] = useState<SmartAlbumRuleDTO[]>([]);
  const [aiConfig, setAiConfig] = useState<SmartAlbumAiConfigDTO | null>(null);
  const [currentRebuildTask, setCurrentRebuildTask] = useState<SmartAlbumRebuildTaskDTO | null>(null);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rebuildPollIntervalRef = useRef<number | null>(null);
  const rebuildPollFailureCountRef = useRef(0);
  const lastHandledCompletedTaskIdRef = useRef<string | null>(null);
  const onRebuildCompleteRef = useRef(options.onRebuildComplete);
  onRebuildCompleteRef.current = options.onRebuildComplete;

  const clearRebuildPolling = useCallback(() => {
    if (rebuildPollIntervalRef.current) {
      clearInterval(rebuildPollIntervalRef.current);
      rebuildPollIntervalRef.current = null;
    }
    rebuildPollFailureCountRef.current = 0;
  }, []);

  const getRebuildStatus = useCallback(async (taskId: string) => {
    try {
      return await api.get<SmartAlbumRebuildTaskDTO>(`/smart-albums/rebuild/${taskId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取自动整理重建状态失败');
      return null;
    }
  }, []);

  const startRebuildPolling = useCallback((taskId: string) => {
    clearRebuildPolling();

    rebuildPollIntervalRef.current = window.setInterval(async () => {
      const status = await getRebuildStatus(taskId);
      if (!status) {
        rebuildPollFailureCountRef.current += 1;
        if (rebuildPollFailureCountRef.current < 3) {
          return;
        }

        clearRebuildPolling();
        setIsRebuilding(false);
        setCurrentRebuildTask((prev) => prev ? {
          ...prev,
          status: 'failed',
          finishedAt: new Date().toISOString(),
          error: '自动整理重建状态轮询失败'
        } : prev);
        window.localStorage.removeItem(SMART_ALBUM_REBUILD_TASK_STORAGE_KEY);
        return;
      }

      rebuildPollFailureCountRef.current = 0;
      setCurrentRebuildTask(status);

      if (status.status === 'completed' || status.status === 'failed') {
        clearRebuildPolling();
        setIsRebuilding(false);
        window.localStorage.removeItem(SMART_ALBUM_REBUILD_TASK_STORAGE_KEY);
        if (status.status === 'completed' && lastHandledCompletedTaskIdRef.current !== status.taskId) {
          lastHandledCompletedTaskIdRef.current = status.taskId;
          void onRebuildCompleteRef.current?.(status);
        }
      }
    }, 2000);
  }, [clearRebuildPolling, getRebuildStatus]);

  const fetchSmartAlbums = useCallback(async (params?: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    status?: 'active' | 'hidden' | 'review_pending';
    sortBy?: 'name' | 'updatedAt' | 'albumCount' | 'assetCount';
    sortOrder?: 'asc' | 'desc';
  }) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<SmartAlbumsListDTO>('/smart-albums', params);
      setSmartAlbums(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取自动整理失败');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchSmartAlbumDetail = useCallback(async (smartAlbumId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const detail = await api.get<SmartAlbumDetailDTO>(`/smart-albums/${smartAlbumId}`);
      const membersResult = await api.get<SmartAlbumMembersListDTO>(`/smart-albums/${smartAlbumId}/albums`);
      setSmartAlbumDetail(detail);
      setSmartAlbumMembers(membersResult.items);
      return { detail, members: membersResult.items };
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取自动整理详情失败');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const rebuildSmartAlbums = useCallback(async () => {
    setError(null);
    try {
      const task = await api.post<SmartAlbumRebuildTaskDTO>('/smart-albums/rebuild', {});
      setCurrentRebuildTask(task);
      const isTaskActive = task.status === 'pending' || task.status === 'running';
      setIsRebuilding(isTaskActive);
      if (isTaskActive) {
        window.localStorage.setItem(SMART_ALBUM_REBUILD_TASK_STORAGE_KEY, task.taskId);
        startRebuildPolling(task.taskId);
      } else {
        window.localStorage.removeItem(SMART_ALBUM_REBUILD_TASK_STORAGE_KEY);
      }
      return task;
    } catch (err) {
      setError(err instanceof Error ? err.message : '重建自动整理失败');
      setIsRebuilding(false);
      return null;
    }
  }, [startRebuildPolling]);

  const fetchRules = useCallback(async () => {
    setError(null);
    try {
      const result = await api.get<SmartAlbumRuleListDTO>('/smart-album-rules');
      setRules(result.items);
      return result.items;
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取归纳规则失败');
      return null;
    }
  }, []);

  const createRule = useCallback(async (input: SmartAlbumRuleUpsertInput) => {
    setError(null);
    try {
      const result = await api.post<SmartAlbumRuleDTO>('/smart-album-rules', input);
      setRules((prev) => [...prev, result].sort((a, b) => b.priority - a.priority));
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建归纳规则失败');
      return null;
    }
  }, []);

  const updateRule = useCallback(async (ruleId: string, input: Partial<SmartAlbumRuleUpsertInput>) => {
    setError(null);
    try {
      const result = await api.put<SmartAlbumRuleDTO>(`/smart-album-rules/${ruleId}`, input);
      setRules((prev) => prev.map((rule) => (rule.id === ruleId ? result : rule)).sort((a, b) => b.priority - a.priority));
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新归纳规则失败');
      return null;
    }
  }, []);

  const deleteRule = useCallback(async (ruleId: string) => {
    setError(null);
    try {
      await api.delete<{ success: boolean }>(`/smart-album-rules/${ruleId}`);
      setRules((prev) => prev.filter((rule) => rule.id !== ruleId));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除归纳规则失败');
      return false;
    }
  }, []);

  const testRule = useCallback(async (ruleId: string) => {
    setError(null);
    try {
      return await api.post<SmartAlbumRuleTestResultDTO>(`/smart-album-rules/${ruleId}/test`, {});
    } catch (err) {
      setError(err instanceof Error ? err.message : '测试归纳规则失败');
      return null;
    }
  }, []);

  const fetchAiConfig = useCallback(async () => {
    setError(null);
    try {
      const result = await api.get<SmartAlbumAiConfigDTO>('/smart-album-ai-config');
      setAiConfig(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取 AI 配置失败');
      return null;
    }
  }, []);

  const saveAiConfig = useCallback(async (input: SmartAlbumAiConfigUpdateInput) => {
    setError(null);
    try {
      const result = await api.put<SmartAlbumAiConfigDTO>('/smart-album-ai-config', input);
      setAiConfig(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新 AI 配置失败');
      return null;
    }
  }, []);

  const testAiConnection = useCallback(async (input?: SmartAlbumAiConnectionTestInput) => {
    setError(null);
    try {
      return await api.post<SmartAlbumAiConnectionTestDTO>('/smart-album-ai-config/test', input ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : '测试 AI 连接失败');
      return null;
    }
  }, []);

  useEffect(() => {
    const persistedTaskId = window.localStorage.getItem(SMART_ALBUM_REBUILD_TASK_STORAGE_KEY);
    if (!persistedTaskId) {
      return;
    }

    void (async () => {
      const status = await getRebuildStatus(persistedTaskId);
      if (!status) {
        window.localStorage.removeItem(SMART_ALBUM_REBUILD_TASK_STORAGE_KEY);
        setIsRebuilding(false);
        return;
      }

      setCurrentRebuildTask(status);
      if (status.status === 'pending' || status.status === 'running') {
        setIsRebuilding(true);
        startRebuildPolling(status.taskId);
        return;
      }

      setIsRebuilding(false);
      window.localStorage.removeItem(SMART_ALBUM_REBUILD_TASK_STORAGE_KEY);
    })();
  }, [getRebuildStatus, startRebuildPolling]);

  useEffect(() => {
    return () => {
      clearRebuildPolling();
    };
  }, [clearRebuildPolling]);

  return {
    smartAlbums,
    smartAlbumDetail,
    smartAlbumMembers,
    rules,
    aiConfig,
    currentRebuildTask,
    isRebuilding,
    isLoading,
    error,
    fetchSmartAlbums,
    fetchSmartAlbumDetail,
    rebuildSmartAlbums,
    getRebuildStatus,
    fetchRules,
    createRule,
    updateRule,
    deleteRule,
    testRule,
    fetchAiConfig,
    saveAiConfig,
    testAiConnection
  };
}
