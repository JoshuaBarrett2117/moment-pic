import { Plus, Save, Wand2, X } from 'lucide-react';
import { WobblyButton } from '../WobblyButton';
import type { SmartAlbumRuleDTO } from '../../types/api';
import type { SmartAlbumRuleDraft } from './smart-album-rule-draft';

type SmartAlbumRuleEditorProps = {
  draftRule: SmartAlbumRuleDraft;
  isEditing: boolean;
  onDraftChange: (updater: (prev: SmartAlbumRuleDraft) => SmartAlbumRuleDraft) => void;
  onSubmit: () => void;
  onCancelEdit: () => void;
};

export function SmartAlbumRuleEditor({
  draftRule,
  isEditing,
  onDraftChange,
  onSubmit,
  onCancelEdit,
}: SmartAlbumRuleEditorProps) {
  return (
    <div className="rounded-2xl bg-surface-container-highest p-4 shadow-sm md:p-6">
      <div className="mb-4 flex items-center gap-3">
        <Wand2 className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-bold text-on-surface">{isEditing ? '编辑归纳规则' : '新增归纳规则'}</h3>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium text-outline">规则名称</span>
          <input
            value={draftRule.name}
            onChange={(event) => onDraftChange((prev) => ({ ...prev, name: event.target.value }))}
            className="w-full rounded-xl border-2 border-outline/20 bg-surface px-4 py-3"
            placeholder="例如：按作者名聚合"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-outline">优先级</span>
          <input
            type="number"
            value={draftRule.priority}
            onChange={(event) => onDraftChange((prev) => ({ ...prev, priority: Number(event.target.value) || 0 }))}
            className="w-full rounded-xl border-2 border-outline/20 bg-surface px-4 py-3"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-outline">匹配范围</span>
          <select
            value={draftRule.scope}
            onChange={(event) => onDraftChange((prev) => ({ ...prev, scope: event.target.value as SmartAlbumRuleDTO['scope'] }))}
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
            onChange={(event) => onDraftChange((prev) => ({ ...prev, matchMode: event.target.value as SmartAlbumRuleDTO['matchMode'] }))}
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
            onChange={(event) => onDraftChange((prev) => ({ ...prev, patterns: event.target.value.split('\n') }))}
            className="min-h-28 w-full rounded-xl border-2 border-outline/20 bg-surface px-4 py-3"
            placeholder={'每行一个关键词，例如：\n桜桃喵\nyuuhui\nXIUREN'}
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-outline">目标名称</span>
          <input
            value={draftRule.targetName ?? ''}
            onChange={(event) => onDraftChange((prev) => ({ ...prev, targetName: event.target.value.trim() ? event.target.value : null }))}
            className="w-full rounded-xl border-2 border-outline/20 bg-surface px-4 py-3"
            placeholder="留空时使用下方模板或命中词"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-outline">目标名称模板</span>
          <input
            value={draftRule.targetNameTemplate ?? ''}
            onChange={(event) => onDraftChange((prev) => ({ ...prev, targetNameTemplate: event.target.value || null }))}
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
            onChange={(event) => onDraftChange((prev) => ({ ...prev, minAlbumCount: Math.max(1, Number(event.target.value) || 1) }))}
            className="w-full rounded-xl border-2 border-outline/20 bg-surface px-4 py-3"
          />
        </label>
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <WobblyButton onClick={onSubmit} className="w-full text-base sm:w-auto md:text-lg">
          {isEditing ? <Save className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
          {isEditing ? '保存修改' : '新增规则'}
        </WobblyButton>
        {isEditing && (
          <button
            onClick={onCancelEdit}
            className="rounded-2xl bg-surface-container-high px-4 py-3 text-sm font-semibold text-on-surface sm:w-auto"
          >
            <X className="mr-2 inline h-4 w-4" />
            取消编辑
          </button>
        )}
      </div>
    </div>
  );
}
