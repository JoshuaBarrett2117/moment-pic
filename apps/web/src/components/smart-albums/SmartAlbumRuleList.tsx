import { Edit2, Search, Trash2 } from 'lucide-react';
import type { SmartAlbumRuleDTO } from '../../types/api';

type SmartAlbumRuleListProps = {
  rules: SmartAlbumRuleDTO[];
  isLoading: boolean;
  testingRuleId: string | null;
  onToggleRule: (rule: SmartAlbumRuleDTO) => void;
  onEditRule: (rule: SmartAlbumRuleDTO) => void;
  onTestRule: (ruleId: string) => void;
  onDeleteRule: (ruleId: string) => void;
};

export function SmartAlbumRuleList({
  rules,
  isLoading,
  testingRuleId,
  onToggleRule,
  onEditRule,
  onTestRule,
  onDeleteRule,
}: SmartAlbumRuleListProps) {
  return (
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
                <button onClick={() => onToggleRule(rule)} className="rounded-xl bg-surface px-3 py-2 text-sm font-semibold text-on-surface">
                  {rule.enabled ? '停用' : '启用'}
                </button>
                <button
                  onClick={() => onEditRule(rule)}
                  className="rounded-xl bg-surface px-3 py-2 text-sm font-semibold text-on-surface"
                  title="编辑规则"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onTestRule(rule.id)}
                  disabled={testingRuleId === rule.id}
                  className="rounded-xl bg-surface px-3 py-2 text-sm font-semibold text-on-surface disabled:opacity-50"
                >
                  {testingRuleId === rule.id ? '测试中...' : '测试命中'}
                </button>
                <button onClick={() => onDeleteRule(rule.id)} className="rounded-xl bg-error-container px-3 py-2 text-sm font-semibold text-on-error-container" title="删除规则">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {!isLoading && rules.length === 0 && <p className="text-sm text-outline">还没有归纳规则，先新增一条试试。</p>}
      </div>
    </div>
  );
}
