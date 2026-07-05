import { RefreshCw, Sparkles } from 'lucide-react';
import { WobblyButton } from '../WobblyButton';
import type { SmartAlbumRebuildTaskDTO } from '../../types/api';

type SmartAlbumRebuildPanelProps = {
  task: SmartAlbumRebuildTaskDTO | null;
  isRebuilding: boolean;
  testSummary: string;
  onRebuild: () => void;
};

export function SmartAlbumRebuildPanel({
  task,
  isRebuilding,
  testSummary,
  onRebuild,
}: SmartAlbumRebuildPanelProps) {
  return (
    <div className="rounded-2xl bg-surface-container-highest p-4 shadow-sm md:p-6">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-bold text-on-surface">自动整理重建</h3>
          <p className="mt-1 text-sm text-outline">修改规则或 AI 配置后，重建任务会在后台执行，页面会自动轮询完成状态。</p>
        </div>
        <WobblyButton onClick={onRebuild} disabled={isRebuilding} className="w-full text-base md:w-auto md:text-lg">
          {isRebuilding ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
          重建自动整理
        </WobblyButton>
      </div>
      {task && (
        <p className="rounded-xl bg-surface-container-high px-4 py-3 text-sm text-outline">
          {task.status === 'pending' && '自动整理重建任务已创建，等待后台开始执行。'}
          {task.status === 'running' && '自动整理正在后台重建中，页面会自动刷新完成状态。'}
          {task.status === 'completed' && `自动整理重建已完成，生成 ${task.result?.smartAlbumsDiscovered ?? 0} 个自动整理。`}
          {task.status === 'failed' && `自动整理重建失败：${task.error || '未知错误'}`}
        </p>
      )}
      {testSummary && <p className="rounded-xl bg-surface-container-high px-4 py-3 text-sm text-outline">{testSummary}</p>}
    </div>
  );
}
