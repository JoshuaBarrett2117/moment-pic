import { Bot, Link2, RefreshCw, Save } from 'lucide-react';
import { WobblyButton } from '../WobblyButton';
import type { SmartAlbumAiConfigDTO } from '../../types/api';

type SmartAlbumAiConfigPanelProps = {
  config: SmartAlbumAiConfigDTO;
  tokenInput: string;
  isMobile: boolean;
  isSaving: boolean;
  isTestingConnection: boolean;
  connectionSummary: string;
  onConfigChange: (updater: (prev: SmartAlbumAiConfigDTO) => SmartAlbumAiConfigDTO) => void;
  onTokenInputChange: (value: string) => void;
  onTestConnection: () => void;
  onSave: () => void;
};

export function SmartAlbumAiConfigPanel({
  config,
  tokenInput,
  isMobile,
  isSaving,
  isTestingConnection,
  connectionSummary,
  onConfigChange,
  onTokenInputChange,
  onTestConnection,
  onSave,
}: SmartAlbumAiConfigPanelProps) {
  return (
    <div className="rounded-2xl bg-surface-container-highest p-4 shadow-sm md:p-6">
      <div className="mb-4 flex items-center gap-3">
        <Bot className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-bold text-on-surface">AI 自动归纳配置</h3>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium text-outline">启用 AI 归纳</span>
          <select
            value={config.enabled ? 'on' : 'off'}
            onChange={(event) => onConfigChange((prev) => ({ ...prev, enabled: event.target.value === 'on' }))}
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
            value={config.mode}
            onChange={(event) => onConfigChange((prev) => ({ ...prev, mode: event.target.value as SmartAlbumAiConfigDTO['mode'] }))}
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
            value={config.apiEndpoint}
            onChange={(event) => onConfigChange((prev) => ({ ...prev, apiEndpoint: event.target.value }))}
            className="w-full rounded-xl border-2 border-outline/20 bg-surface px-4 py-3"
            placeholder="https://api.openai.com/v1"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-outline">模型</span>
          <input
            value={config.apiModel}
            onChange={(event) => onConfigChange((prev) => ({ ...prev, apiModel: event.target.value }))}
            className="w-full rounded-xl border-2 border-outline/20 bg-surface px-4 py-3"
            placeholder="gpt-4.1-mini"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-outline">Token</span>
          <input
            type="password"
            value={tokenInput}
            onChange={(event) => onTokenInputChange(event.target.value)}
            className="w-full rounded-xl border-2 border-outline/20 bg-surface px-4 py-3"
            placeholder={config.hasApiToken ? `已保存：${config.apiTokenMasked ?? '******'}` : '输入新的 OpenAI Token'}
          />
          <p className="text-xs text-outline/70">
            {config.hasApiToken ? '留空将继续使用当前已保存 Token。' : '当前还没有保存 Token。'}
          </p>
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-outline">自动应用置信度阈值</span>
          <input
            type="number"
            min="0"
            max="1"
            step="0.05"
            value={config.minConfidenceAutoApply}
            onChange={(event) => onConfigChange((prev) => ({ ...prev, minConfidenceAutoApply: Number(event.target.value) }))}
            className="w-full rounded-xl border-2 border-outline/20 bg-surface px-4 py-3"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-outline">最小聚类图集数</span>
          <input
            type="number"
            min="1"
            value={config.minClusterAlbumCount}
            onChange={(event) => onConfigChange((prev) => ({ ...prev, minClusterAlbumCount: Math.max(1, Number(event.target.value) || 1) }))}
            className="w-full rounded-xl border-2 border-outline/20 bg-surface px-4 py-3"
          />
        </label>
        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-medium text-outline">排除词</span>
          <textarea
            value={config.excludedTokens.join('\n')}
            onChange={(event) => onConfigChange((prev) => ({
              ...prev,
              excludedTokens: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean),
            }))}
            className="min-h-24 w-full rounded-xl border-2 border-outline/20 bg-surface px-4 py-3"
            placeholder={'每行一个排除词，例如：\n合集\n写真\nMoment'}
          />
        </label>
      </div>
      {connectionSummary && (
        <p className="mt-4 rounded-xl bg-surface-container-high px-4 py-3 text-sm text-outline">{connectionSummary}</p>
      )}
      <div className={`mt-4 flex ${isMobile ? 'flex-col' : 'flex-row flex-wrap'} gap-3`}>
        <button
          onClick={onTestConnection}
          disabled={isTestingConnection}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-surface-container-high px-4 py-3 text-sm font-semibold text-on-surface disabled:opacity-50 md:w-auto"
        >
          {isTestingConnection ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Link2 className="h-5 w-5" />}
          测试连接
        </button>
        <WobblyButton onClick={onSave} disabled={isSaving} className="w-full text-base md:w-auto md:text-lg">
          {isSaving ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
          保存 AI 配置
        </WobblyButton>
      </div>
    </div>
  );
}
