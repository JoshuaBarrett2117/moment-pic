import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useMobile, useSmartAlbums } from '../hooks';
import { useToast } from './Toast';
import type { SmartAlbumAiConfigDTO, SmartAlbumRuleDTO } from '../types/api';
import { DEFAULT_SMART_ALBUM_RULE, normalizeRulePatterns, toEditableRuleDraft } from './smart-albums/smart-album-rule-draft';
import { SmartAlbumAiConfigPanel } from './smart-albums/SmartAlbumAiConfigPanel';
import { SmartAlbumRebuildPanel } from './smart-albums/SmartAlbumRebuildPanel';
import { SmartAlbumRuleEditor } from './smart-albums/SmartAlbumRuleEditor';
import { SmartAlbumRuleList } from './smart-albums/SmartAlbumRuleList';

interface SmartAlbumSettingsPanelProps {
  onRebuildComplete?: () => void | Promise<void>;
}

export const SmartAlbumSettingsPanel: React.FC<SmartAlbumSettingsPanelProps> = ({ onRebuildComplete }) => {
  const {
    rules,
    aiConfig,
    currentRebuildTask,
    isRebuilding,
    isLoading,
    error,
    fetchRules,
    createRule,
    updateRule,
    deleteRule,
    testRule,
    fetchAiConfig,
    saveAiConfig,
    testAiConnection,
    rebuildSmartAlbums
  } = useSmartAlbums({
    onRebuildComplete: async () => {
      await onRebuildComplete?.();
    }
  });
  const isMobile = useMobile();
  const { toast } = useToast();
  const [draftRule, setDraftRule] = useState(DEFAULT_SMART_ALBUM_RULE);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [testingRuleId, setTestingRuleId] = useState<string | null>(null);
  const [testSummary, setTestSummary] = useState<string>('');
  const [savingAi, setSavingAi] = useState(false);
  const [localAiConfig, setLocalAiConfig] = useState<SmartAlbumAiConfigDTO | null>(null);
  const [aiTokenInput, setAiTokenInput] = useState('');
  const [testingAiConnection, setTestingAiConnection] = useState(false);
  const [aiConnectionSummary, setAiConnectionSummary] = useState<string>('');
  const [handledRebuildTaskId, setHandledRebuildTaskId] = useState<string | null>(null);

  useEffect(() => {
    void fetchRules();
    void fetchAiConfig();
  }, [fetchAiConfig, fetchRules]);

  useEffect(() => {
    if (aiConfig) {
      setLocalAiConfig(aiConfig);
      setAiTokenInput('');
    }
  }, [aiConfig]);

  useEffect(() => {
    if (!currentRebuildTask || handledRebuildTaskId === currentRebuildTask.taskId) {
      return;
    }

    if (currentRebuildTask.status === 'completed') {
      setHandledRebuildTaskId(currentRebuildTask.taskId);
      toast(`自动整理已重建，生成 ${currentRebuildTask.result?.smartAlbumsDiscovered ?? 0} 个自动整理`, 'success');
      return;
    }

    if (currentRebuildTask.status === 'failed') {
      setHandledRebuildTaskId(currentRebuildTask.taskId);
      toast(currentRebuildTask.error || '自动整理重建失败', 'error');
    }
  }, [currentRebuildTask, handledRebuildTaskId, toast]);

  const normalizedPatterns = useMemo(
    () => normalizeRulePatterns(draftRule.patterns),
    [draftRule.patterns]
  );

  const handleSubmitRule = async () => {
    if (!draftRule.name.trim() || normalizedPatterns.length === 0) {
      toast('请先填写规则名称和至少一个匹配词', 'error');
      return;
    }

    const input = {
      ...draftRule,
      patterns: normalizedPatterns
    };
    const result = editingRuleId
      ? await updateRule(editingRuleId, input)
      : await createRule(input);
    if (!result) {
      toast(editingRuleId ? '规则更新失败' : '规则创建失败', 'error');
      return;
    }
    setEditingRuleId(null);
    setDraftRule(DEFAULT_SMART_ALBUM_RULE);
    toast(editingRuleId ? '归纳规则已更新' : '归纳规则已创建', 'success');
  };

  const handleToggleRule = async (rule: SmartAlbumRuleDTO) => {
    const result = await updateRule(rule.id, { enabled: !rule.enabled });
    if (!result) {
      toast('规则更新失败', 'error');
      return;
    }
    toast(rule.enabled ? '规则已停用' : '规则已启用', 'success');
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!window.confirm('确定删除这条归纳规则吗？')) {
      return;
    }
    const success = await deleteRule(ruleId);
    if (!success) {
      toast('规则删除失败', 'error');
      return;
    }
    toast('规则已删除', 'success');
  };

  const handleEditRule = (rule: SmartAlbumRuleDTO) => {
    setEditingRuleId(rule.id);
    setDraftRule(toEditableRuleDraft(rule));
  };

  const handleCancelEditRule = () => {
    setEditingRuleId(null);
    setDraftRule(DEFAULT_SMART_ALBUM_RULE);
  };

  const handleTestRule = async (ruleId: string) => {
    setTestingRuleId(ruleId);
    const result = await testRule(ruleId);
    setTestingRuleId(null);
    if (!result) {
      toast('规则测试失败', 'error');
      return;
    }
    setTestSummary(`命中 ${result.matchedAlbums.length} 个图集：${result.matchedAlbums.slice(0, 5).map((item) => item.name).join('、') || '无'}`);
    toast('规则测试已完成', 'success');
  };

  const handleSaveAiConfig = async () => {
    if (!localAiConfig) {
      return;
    }
    setSavingAi(true);
    const result = await saveAiConfig({
      enabled: localAiConfig.enabled,
      mode: localAiConfig.mode,
      provider: 'openai',
      apiEndpoint: localAiConfig.apiEndpoint,
      apiModel: localAiConfig.apiModel,
      apiToken: aiTokenInput.trim() ? aiTokenInput.trim() : undefined,
      minConfidenceAutoApply: localAiConfig.minConfidenceAutoApply,
      minClusterAlbumCount: localAiConfig.minClusterAlbumCount,
      maxSuggestionsPerRun: localAiConfig.maxSuggestionsPerRun,
      allowAliasMerge: localAiConfig.allowAliasMerge,
      allowCrossRootGrouping: localAiConfig.allowCrossRootGrouping,
      excludedTokens: localAiConfig.excludedTokens,
      preferredScopes: localAiConfig.preferredScopes,
      reviewRequiredBelowConfidence: localAiConfig.reviewRequiredBelowConfidence
    });
    setSavingAi(false);
    if (!result) {
      toast('AI 配置保存失败', 'error');
      return;
    }
    setLocalAiConfig(result);
    setAiTokenInput('');
    toast('AI 配置已保存', 'success');
  };

  const handleTestAiConnection = async () => {
    if (!localAiConfig) {
      return;
    }

    setTestingAiConnection(true);
    const result = await testAiConnection({
      provider: 'openai',
      apiEndpoint: localAiConfig.apiEndpoint,
      apiModel: localAiConfig.apiModel,
      apiToken: aiTokenInput.trim() ? aiTokenInput.trim() : undefined
    });
    setTestingAiConnection(false);

    if (!result) {
      setAiConnectionSummary('连接测试失败，请检查后端报错信息。');
      toast('AI 连接测试失败', 'error');
      return;
    }

    setAiConnectionSummary(`${result.success ? '成功' : '失败'} · ${result.latencyMs}ms · ${result.message}`);
    toast(result.success ? 'AI 连接测试成功' : 'AI 连接测试失败', result.success ? 'success' : 'error');
  };

  const handleRebuild = async () => {
    const task = await rebuildSmartAlbums();
    if (!task) {
      toast('自动整理重建失败', 'error');
      return;
    }
    if (task.status === 'pending' || task.status === 'running') {
      toast('自动整理已开始后台重建，页面会自动轮询结果', 'info');
    }
  };

  return (
    <div className="space-y-6 md:space-y-8">
      {error && (
        <div className="rounded-2xl bg-error-container px-4 py-3 text-on-error-container">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      <SmartAlbumRebuildPanel
        task={currentRebuildTask}
        isRebuilding={isRebuilding}
        testSummary={testSummary}
        onRebuild={handleRebuild}
      />

      <SmartAlbumRuleEditor
        draftRule={draftRule}
        isEditing={Boolean(editingRuleId)}
        onDraftChange={setDraftRule}
        onSubmit={() => void handleSubmitRule()}
        onCancelEdit={handleCancelEditRule}
      />

      <SmartAlbumRuleList
        rules={rules}
        isLoading={isLoading}
        testingRuleId={testingRuleId}
        onToggleRule={handleToggleRule}
        onEditRule={handleEditRule}
        onTestRule={(ruleId) => void handleTestRule(ruleId)}
        onDeleteRule={(ruleId) => void handleDeleteRule(ruleId)}
      />

      {localAiConfig && (
        <SmartAlbumAiConfigPanel
          config={localAiConfig}
          tokenInput={aiTokenInput}
          isMobile={isMobile}
          isSaving={savingAi}
          isTestingConnection={testingAiConnection}
          connectionSummary={aiConnectionSummary}
          onConfigChange={(updater) => setLocalAiConfig((prev) => prev ? updater(prev) : prev)}
          onTokenInputChange={setAiTokenInput}
          onTestConnection={() => void handleTestAiConnection()}
          onSave={() => void handleSaveAiConfig()}
        />
      )}
    </div>
  );
};
