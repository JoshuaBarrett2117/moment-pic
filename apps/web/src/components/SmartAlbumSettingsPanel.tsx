import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Bot, Edit2, Link2, Plus, RefreshCw, Save, Search, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import { useMobile, useSmartAlbums } from '../hooks';
import { WobblyButton } from './WobblyButton';
import { useToast } from './Toast';
import type { SmartAlbumAiConfigDTO, SmartAlbumRuleDTO } from '../types/api';

const DEFAULT_RULE: Omit<SmartAlbumRuleDTO, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  enabled: true,
  sourceEngine: 'manual',
  priority: 100,
  scope: 'albumName',
  matchMode: 'contains',
  patterns: [''],
  normalizeOptions: {
    trimSpaces: true,
    normalizeCase: true,
    stripSequenceNo: true,
    stripDate: true,
    stripPageStats: true,
    stripSizeStats: true
  },
  action: 'assignSmartAlbum',
  targetName: null,
  targetNameTemplate: '{{token}}',
  minAlbumCount: 2,
  minConfidence: 1,
  generatedNormalizedKey: null,
  generatedConfidence: null,
  generatedReason: null,
  generatedRunId: null
};

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
  const [draftRule, setDraftRule] = useState(DEFAULT_RULE);
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
    () => draftRule.patterns.map((item) => item.trim()).filter(Boolean),
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
    setDraftRule(DEFAULT_RULE);
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
    setDraftRule({
      name: rule.name,
      enabled: rule.enabled,
      priority: rule.priority,
      scope: rule.scope,
      matchMode: rule.matchMode,
      patterns: rule.patterns,
      normalizeOptions: rule.normalizeOptions,
      action: rule.action,
      targetName: rule.targetName,
      targetNameTemplate: rule.targetNameTemplate,
      minAlbumCount: rule.minAlbumCount,
      minConfidence: rule.minConfidence,
      sourceEngine: 'manual',
      generatedNormalizedKey: null,
      generatedConfidence: null,
      generatedReason: null,
      generatedRunId: null
    });
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

      <div className="rounded-2xl bg-surface-container-highest p-4 shadow-sm md:p-6">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-bold text-on-surface">自动整理重建</h3>
            <p className="mt-1 text-sm text-outline">修改规则或 AI 配置后，重建任务会在后台执行，页面会自动轮询完成状态。</p>
          </div>
          <WobblyButton onClick={handleRebuild} disabled={isRebuilding} className="w-full text-base md:w-auto md:text-lg">
            {isRebuilding ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
            重建自动整理
          </WobblyButton>
        </div>
        {currentRebuildTask && (
          <p className="rounded-xl bg-surface-container-high px-4 py-3 text-sm text-outline">
            {currentRebuildTask.status === 'pending' && '自动整理重建任务已创建，等待后台开始执行。'}
            {currentRebuildTask.status === 'running' && '自动整理正在后台重建中，页面会自动刷新完成状态。'}
            {currentRebuildTask.status === 'completed' && `自动整理重建已完成，生成 ${currentRebuildTask.result?.smartAlbumsDiscovered ?? 0} 个自动整理。`}
            {currentRebuildTask.status === 'failed' && `自动整理重建失败：${currentRebuildTask.error || '未知错误'}`}
          </p>
        )}
        {testSummary && <p className="rounded-xl bg-surface-container-high px-4 py-3 text-sm text-outline">{testSummary}</p>}
      </div>

      <div className="rounded-2xl bg-surface-container-highest p-4 shadow-sm md:p-6">
        <div className="mb-4 flex items-center gap-3">
          <Wand2 className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold text-on-surface">{editingRuleId ? '编辑归纳规则' : '新增归纳规则'}</h3>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-outline">规则名称</span>
            <input
              value={draftRule.name}
              onChange={(event) => setDraftRule((prev) => ({ ...prev, name: event.target.value }))}
              className="w-full rounded-xl border-2 border-outline/20 bg-surface px-4 py-3"
              placeholder="例如：按作者名聚合"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-outline">优先级</span>
            <input
              type="number"
              value={draftRule.priority}
              onChange={(event) => setDraftRule((prev) => ({ ...prev, priority: Number(event.target.value) || 0 }))}
              className="w-full rounded-xl border-2 border-outline/20 bg-surface px-4 py-3"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-outline">匹配范围</span>
            <select
              value={draftRule.scope}
              onChange={(event) => setDraftRule((prev) => ({ ...prev, scope: event.target.value as SmartAlbumRuleDTO['scope'] }))}
              className="w-full rounded-xl border-2 border-outline/20 bg-surface px-4 py-3"
            >
              <option value="albumName">图集名称</option>
              <option value="sourcePath">完整路径</option>
              <option value="parentPath">父目录</option>
              <option value="assetFileName">文件名</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-outline">匹配方式</span>
            <select
              value={draftRule.matchMode}
              onChange={(event) => setDraftRule((prev) => ({ ...prev, matchMode: event.target.value as SmartAlbumRuleDTO['matchMode'] }))}
              className="w-full rounded-xl border-2 border-outline/20 bg-surface px-4 py-3"
            >
              <option value="contains">包含</option>
              <option value="equals">完全等于</option>
              <option value="prefix">前缀</option>
              <option value="suffix">后缀</option>
              <option value="regex">正则</option>
            </select>
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-outline">匹配词</span>
            <textarea
              value={draftRule.patterns.join('\n')}
              onChange={(event) => setDraftRule((prev) => ({ ...prev, patterns: event.target.value.split('\n') }))}
              className="min-h-28 w-full rounded-xl border-2 border-outline/20 bg-surface px-4 py-3"
              placeholder={'每行一个关键词，例如：\n桜桃喵\nyuuhui\nXIUREN'}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-outline">目标名称</span>
            <input
              value={draftRule.targetName ?? ''}
              onChange={(event) => setDraftRule((prev) => ({ ...prev, targetName: event.target.value.trim() ? event.target.value : null }))}
              className="w-full rounded-xl border-2 border-outline/20 bg-surface px-4 py-3"
              placeholder="留空时使用下方模板或命中词"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-outline">目标名称模板</span>
            <input
              value={draftRule.targetNameTemplate ?? ''}
              onChange={(event) => setDraftRule((prev) => ({ ...prev, targetNameTemplate: event.target.value || null }))}
              className="w-full rounded-xl border-2 border-outline/20 bg-surface px-4 py-3"
              placeholder="{{token}}"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-outline">最少命中图集数</span>
            <input
              type="number"
              min="1"
              value={draftRule.minAlbumCount}
              onChange={(event) => setDraftRule((prev) => ({ ...prev, minAlbumCount: Math.max(1, Number(event.target.value) || 1) }))}
              className="w-full rounded-xl border-2 border-outline/20 bg-surface px-4 py-3"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <WobblyButton onClick={handleSubmitRule} className="w-full text-base sm:w-auto md:text-lg">
            {editingRuleId ? <Save className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
            {editingRuleId ? '保存修改' : '新增规则'}
          </WobblyButton>
          {editingRuleId && (
            <button
              onClick={() => {
                setEditingRuleId(null);
                setDraftRule(DEFAULT_RULE);
              }}
              className="rounded-2xl bg-surface-container-high px-4 py-3 text-sm font-semibold text-on-surface sm:w-auto"
            >
              <X className="mr-2 inline h-4 w-4" />
              取消编辑
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-surface-container-highest p-4 shadow-sm md:p-6">
        <div className="mb-4 flex items-center gap-3">
          <Search className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold text-on-surface">规则列表</h3>
        </div>
        <div className="space-y-4">
          {rules.map((rule) => (
            <div key={rule.id} className="rounded-2xl bg-surface-container-high p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-base font-bold text-on-surface">{rule.name}</h4>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${rule.enabled ? 'bg-primary-container text-on-primary-container' : 'bg-outline/10 text-outline'}`}>
                      {rule.enabled ? '已启用' : '已停用'}
                    </span>
                    <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-outline">
                      {rule.sourceEngine === 'ai' ? 'AI 生成' : '手动规则'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-outline">
                    范围：{rule.scope} · 方式：{rule.matchMode} · 最少命中：{rule.minAlbumCount}
                  </p>
                  <p className="mt-2 text-sm text-outline/80">
                    目标名称：{rule.targetName?.trim() || '未固定'}{rule.targetNameTemplate ? ` · 模板：${rule.targetNameTemplate}` : ''}
                  </p>
                  <p className="mt-2 text-sm text-outline/80">关键词：{rule.patterns.join('、')}</p>
                  {rule.generatedReason ? (
                    <p className="mt-2 text-xs text-outline/70">
                      来源：{rule.generatedReason}
                    </p>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  <button onClick={() => handleToggleRule(rule)} className="rounded-xl bg-surface px-3 py-2 text-sm font-semibold text-on-surface">
                    {rule.enabled ? '停用' : '启用'}
                  </button>
                  <button
                    onClick={() => handleEditRule(rule)}
                    className="rounded-xl bg-surface px-3 py-2 text-sm font-semibold text-on-surface"
                    title="编辑规则"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => void handleTestRule(rule.id)}
                    disabled={testingRuleId === rule.id}
                    className="rounded-xl bg-surface px-3 py-2 text-sm font-semibold text-on-surface disabled:opacity-50"
                  >
                    {testingRuleId === rule.id ? '测试中...' : '测试命中'}
                  </button>
                  <button onClick={() => void handleDeleteRule(rule.id)} className="rounded-xl bg-error-container px-3 py-2 text-sm font-semibold text-on-error-container" title="删除规则">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {!isLoading && rules.length === 0 && <p className="text-sm text-outline">还没有归纳规则，先新增一条试试。</p>}
        </div>
      </div>

      {localAiConfig && (
        <div className="rounded-2xl bg-surface-container-highest p-4 shadow-sm md:p-6">
          <div className="mb-4 flex items-center gap-3">
            <Bot className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold text-on-surface">AI 自动归纳配置</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-outline">启用 AI 归纳</span>
              <select
                value={localAiConfig.enabled ? 'on' : 'off'}
                onChange={(event) => setLocalAiConfig((prev) => prev ? { ...prev, enabled: event.target.value === 'on' } : prev)}
                className="w-full rounded-xl border-2 border-outline/20 bg-surface px-4 py-3"
              >
                <option value="off">关闭</option>
                <option value="on">开启</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-outline">服务商</span>
              <input
                value="OpenAI Compatible"
                disabled
                className="w-full rounded-xl border-2 border-outline/20 bg-surface-container-high px-4 py-3 text-outline"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-outline">运行模式</span>
              <select
                value={localAiConfig.mode}
                onChange={(event) => setLocalAiConfig((prev) => prev ? { ...prev, mode: event.target.value as SmartAlbumAiConfigDTO['mode'] } : prev)}
                className="w-full rounded-xl border-2 border-outline/20 bg-surface px-4 py-3"
              >
                <option value="assist">辅助建议</option>
                <option value="auto_low_risk">低风险自动应用</option>
                <option value="full_auto">全自动</option>
              </select>
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-outline">API 端点</span>
              <input
                value={localAiConfig.apiEndpoint}
                onChange={(event) => setLocalAiConfig((prev) => prev ? { ...prev, apiEndpoint: event.target.value } : prev)}
                className="w-full rounded-xl border-2 border-outline/20 bg-surface px-4 py-3"
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-outline">模型</span>
              <input
                value={localAiConfig.apiModel}
                onChange={(event) => setLocalAiConfig((prev) => prev ? { ...prev, apiModel: event.target.value } : prev)}
                className="w-full rounded-xl border-2 border-outline/20 bg-surface px-4 py-3"
                placeholder="gpt-4.1-mini"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-outline">Token</span>
              <input
                type="password"
                value={aiTokenInput}
                onChange={(event) => setAiTokenInput(event.target.value)}
                className="w-full rounded-xl border-2 border-outline/20 bg-surface px-4 py-3"
                placeholder={localAiConfig.hasApiToken ? `已保存：${localAiConfig.apiTokenMasked ?? '******'}` : '输入新的 OpenAI Token'}
              />
              <p className="text-xs text-outline/70">
                {localAiConfig.hasApiToken ? '留空将继续使用当前已保存 Token。' : '当前还没有保存 Token。'}
              </p>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-outline">自动应用置信度阈值</span>
              <input
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={localAiConfig.minConfidenceAutoApply}
                onChange={(event) => setLocalAiConfig((prev) => prev ? { ...prev, minConfidenceAutoApply: Number(event.target.value) } : prev)}
                className="w-full rounded-xl border-2 border-outline/20 bg-surface px-4 py-3"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-outline">最小聚类图集数</span>
              <input
                type="number"
                min="1"
                value={localAiConfig.minClusterAlbumCount}
                onChange={(event) => setLocalAiConfig((prev) => prev ? { ...prev, minClusterAlbumCount: Math.max(1, Number(event.target.value) || 1) } : prev)}
                className="w-full rounded-xl border-2 border-outline/20 bg-surface px-4 py-3"
              />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-outline">排除词</span>
              <textarea
                value={localAiConfig.excludedTokens.join('\n')}
                onChange={(event) => setLocalAiConfig((prev) => prev ? { ...prev, excludedTokens: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean) } : prev)}
                className="min-h-24 w-full rounded-xl border-2 border-outline/20 bg-surface px-4 py-3"
                placeholder={'每行一个排除词，例如：\n合集\n写真\nMoment'}
              />
            </label>
          </div>
          {aiConnectionSummary && (
            <p className="mt-4 rounded-xl bg-surface-container-high px-4 py-3 text-sm text-outline">{aiConnectionSummary}</p>
          )}
          <div className={`mt-4 flex ${isMobile ? 'flex-col' : 'flex-row flex-wrap'} gap-3`}>
            <button
              onClick={() => void handleTestAiConnection()}
              disabled={testingAiConnection}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-surface-container-high px-4 py-3 text-sm font-semibold text-on-surface disabled:opacity-50 md:w-auto"
            >
              {testingAiConnection ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Link2 className="h-5 w-5" />}
              测试连接
            </button>
            <WobblyButton onClick={handleSaveAiConfig} disabled={savingAi} className="w-full text-base md:w-auto md:text-lg">
              {savingAi ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              保存 AI 配置
            </WobblyButton>
          </div>
        </div>
      )}
    </div>
  );
};
