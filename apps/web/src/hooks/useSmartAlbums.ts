import { useCallback, useState } from 'react';
import { api } from '../lib/api';
import type {
  SmartAlbumAiConfigDTO,
  SmartAlbumDetailDTO,
  SmartAlbumMemberDTO,
  SmartAlbumMembersListDTO,
  SmartAlbumRebuildResultDTO,
  SmartAlbumRuleDTO,
  SmartAlbumRuleListDTO,
  SmartAlbumRuleTestResultDTO,
  SmartAlbumsListDTO
} from '../types/api';

type SmartAlbumRuleUpsertInput = Omit<SmartAlbumRuleDTO, 'id' | 'createdAt' | 'updatedAt'>;
type SmartAlbumAiConfigUpdateInput = Omit<SmartAlbumAiConfigDTO, 'id' | 'createdAt' | 'updatedAt'>;

export function useSmartAlbums() {
  const [smartAlbums, setSmartAlbums] = useState<SmartAlbumsListDTO | null>(null);
  const [smartAlbumDetail, setSmartAlbumDetail] = useState<SmartAlbumDetailDTO | null>(null);
  const [smartAlbumMembers, setSmartAlbumMembers] = useState<SmartAlbumMemberDTO[] | null>(null);
  const [rules, setRules] = useState<SmartAlbumRuleDTO[]>([]);
  const [aiConfig, setAiConfig] = useState<SmartAlbumAiConfigDTO | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      return await api.post<SmartAlbumRebuildResultDTO>('/smart-albums/rebuild', {});
    } catch (err) {
      setError(err instanceof Error ? err.message : '重建自动整理失败');
      return null;
    }
  }, []);

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

  return {
    smartAlbums,
    smartAlbumDetail,
    smartAlbumMembers,
    rules,
    aiConfig,
    isLoading,
    error,
    fetchSmartAlbums,
    fetchSmartAlbumDetail,
    rebuildSmartAlbums,
    fetchRules,
    createRule,
    updateRule,
    deleteRule,
    testRule,
    fetchAiConfig,
    saveAiConfig
  };
}
