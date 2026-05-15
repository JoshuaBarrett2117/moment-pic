import type { FC } from 'react';
import { AlertCircle, Check, Edit2, Folder, Images, Loader2, Plus, RefreshCw, Settings, Trash2, X } from 'lucide-react';

import type { LibraryRootDTO, PageTransitionModeDTO, SystemConfigDTO } from '../types/api';
import type { SystemConfigUpdates } from '../hooks/useSystemConfig';
import { WobblyButton } from './WobblyButton';
import { formatLibraryRootScanTime } from './settings-screen-utils';

type ImageQualityPreset = 'low' | 'balanced' | 'high' | 'original';

type SettingsBasicPanelProps = {
  addLibraryRoot: () => void | Promise<void>;
  defaultImageQualityPreset: ImageQualityPreset;
  editingId: string | null;
  editingName: string;
  editingPath: string;
  error: string | null;
  isAdding: boolean;
  isAnyScanning: boolean;
  isLoading: boolean;
  isSavingConfig: boolean;
  isScanning: (libraryRootId: string) => boolean;
  libraryRoots: LibraryRootDTO[];
  newName: string;
  newPath: string;
  onSystemConfigChange?: () => void | Promise<void>;
  pageTransitionMode: PageTransitionModeDTO;
  preloadAfter: number;
  preloadBefore: number;
  saveConfig: (updates: SystemConfigUpdates) => Promise<boolean>;
  saveDefaultImageQualityPreset: (preset: ImageQualityPreset) => Promise<boolean>;
  savePageTransitionMode: (mode: PageTransitionModeDTO) => Promise<boolean>;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  scanLibraryRoot: (libraryRootId?: string) => void | Promise<void>;
  setEditingName: (value: string) => void;
  setEditingPath: (value: string) => void;
  setNewName: (value: string) => void;
  setNewPath: (value: string) => void;
  systemConfig: SystemConfigDTO | null;
  updatePreloadRadius: (value: string, type: 'before' | 'after') => void;
  cancelEdit: () => void;
  deleteRoot: (id: string) => void | Promise<void>;
  saveEdit: () => void | Promise<void>;
  startEdit: (root: Pick<LibraryRootDTO, 'id' | 'name' | 'path'>) => void;
};

export const SettingsBasicPanel: FC<SettingsBasicPanelProps> = ({
  addLibraryRoot,
  defaultImageQualityPreset,
  editingId,
  editingName,
  editingPath,
  error,
  isAdding,
  isAnyScanning,
  isLoading,
  isSavingConfig,
  isScanning,
  libraryRoots,
  newName,
  newPath,
  onSystemConfigChange,
  pageTransitionMode,
  preloadAfter,
  preloadBefore,
  saveConfig,
  saveDefaultImageQualityPreset,
  savePageTransitionMode,
  saveStatus,
  scanLibraryRoot,
  setEditingName,
  setEditingPath,
  setNewName,
  setNewPath,
  systemConfig,
  updatePreloadRadius,
  cancelEdit,
  deleteRoot,
  saveEdit,
  startEdit,
}) => (
  <>
    <header className="mb-6 md:mb-12">
      <h2 className="text-2xl md:text-4xl font-headline font-black text-on-surface">基础设置</h2>
      <p className="text-outline mt-2">配置图片库目录，并管理查看器相关设置</p>
      <p className="mt-3 text-sm text-outline/80">
        {saveStatus === 'saving' && '正在保存设置...'}
        {saveStatus === 'saved' && '设置已自动保存'}
        {saveStatus === 'error' && '设置保存失败，请稍后重试'}
        {saveStatus === 'idle' && '数值项会在失焦后自动保存'}
      </p>
    </header>

    {error && (
      <div className="mb-6 p-4 bg-error-container text-on-error-container rounded-lg flex items-center gap-2">
        <AlertCircle className="w-5 h-5" />
        {error}
      </div>
    )}

    <div className="bg-surface-container-highest rounded-2xl p-6 mb-8">
      <h3 className="text-lg font-bold text-on-surface mb-4">图片预览</h3>
      <div className="space-y-4">
        <div className="flex items-start gap-4 rounded-xl bg-surface-container-high p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container">
            <Settings className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="font-bold text-on-surface">页面跳转形式</p>
                <p className="mt-1 text-sm text-outline">选择页面切换时使用翻页滑动，或常规淡入淡出</p>
              </div>
              <select
                value={pageTransitionMode}
                onChange={async (event) => {
                  const didSave = await savePageTransitionMode(event.target.value as PageTransitionModeDTO);
                  if (didSave) {
                    await onSystemConfigChange?.();
                  }
                }}
                disabled={isSavingConfig}
                className="rounded-xl border-2 border-outline/20 bg-surface px-4 py-2 font-semibold text-on-surface outline-none focus:border-primary disabled:opacity-50"
              >
                <option value="page">翻页滑动</option>
                <option value="normal">常规淡入</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-4 rounded-xl bg-surface-container-high p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container">
            <Images className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="font-bold text-on-surface">大图默认画质</p>
                <p className="mt-1 text-sm text-outline">大图查看器默认使用的画质档位，用户仍可在查看器内随时切换</p>
              </div>
              <select
                value={defaultImageQualityPreset}
                onChange={async (event) => {
                  await saveDefaultImageQualityPreset(event.target.value as ImageQualityPreset);
                }}
                disabled={isSavingConfig}
                className="rounded-xl border-2 border-outline/20 bg-surface px-4 py-2 font-semibold text-on-surface outline-none focus:border-primary disabled:opacity-50"
              >
                <option value="low">省流</option>
                <option value="balanced">均衡</option>
                <option value="high">高清</option>
                <option value="original">原图</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-4 rounded-xl bg-surface-container-high p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container">
            <Images className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="font-bold text-on-surface">图片预加载张数</p>
                <p className="mt-1 text-sm text-outline">查看大图时，预先加载当前图片前后相邻的图片数量</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-outline">前</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={preloadBefore}
                    onChange={(event) => updatePreloadRadius(event.target.value, 'before')}
                    onBlur={async () => {
                      if (systemConfig) {
                        await saveConfig({ preloadBefore });
                      }
                    }}
                    disabled={isSavingConfig}
                    className="w-20 rounded-xl border-2 border-outline/20 bg-surface px-3 py-2 text-center font-semibold text-on-surface outline-none focus:border-primary disabled:opacity-50"
                  />
                  <span className="text-sm text-outline">张</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-outline">后</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={preloadAfter}
                    onChange={(event) => updatePreloadRadius(event.target.value, 'after')}
                    onBlur={async () => {
                      if (systemConfig) {
                        await saveConfig({ preloadAfter });
                      }
                    }}
                    disabled={isSavingConfig}
                    className="w-20 rounded-xl border-2 border-outline/20 bg-surface px-3 py-2 text-center font-semibold text-on-surface outline-none focus:border-primary disabled:opacity-50"
                  />
                  <span className="text-sm text-outline">张</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div className="bg-surface-container-highest rounded-2xl p-4 md:p-6 mb-8">
      <h3 className="text-lg font-bold text-on-surface mb-4">添加库目录</h3>
      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-outline mb-2">路径</label>
          <input
            type="text"
            value={newPath}
            onChange={(event) => setNewPath(event.target.value)}
            placeholder="例如: /volume1/pb1/photos"
            className="w-full px-4 py-3 bg-surface-container-high border-2 border-outline/20 rounded-xl focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-outline mb-2">名称（可选）</label>
          <input
            type="text"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="例如: 我的照片"
            className="w-full px-4 py-3 bg-surface-container-high border-2 border-outline/20 rounded-xl focus:border-primary focus:outline-none"
          />
        </div>
        <WobblyButton onClick={addLibraryRoot} disabled={!newPath.trim() || isAdding} className="self-start">
          {isAdding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
          添加目录
        </WobblyButton>
      </div>
    </div>

    <div className="bg-surface-container-highest rounded-2xl p-4 md:p-6 mb-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <h3 className="text-lg font-bold text-on-surface">库目录列表</h3>
        <button
          onClick={() => scanLibraryRoot()}
          disabled={isAnyScanning}
          className="flex items-center gap-2 px-4 py-2 bg-primary-container text-on-primary-container rounded-lg hover:brightness-95 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isAnyScanning ? 'animate-spin' : ''}`} />
          扫描全部
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-outline" />
        </div>
      ) : libraryRoots.length === 0 ? (
        <p className="text-center text-outline py-8">暂无库目录</p>
      ) : (
        <div className="space-y-4">
          {libraryRoots.map((root) => (
            <div key={root.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-surface-container-high rounded-xl gap-4">
              <div className="flex items-start md:items-center gap-4 min-w-0">
                <Folder className="w-8 h-8 md:w-10 md:h-10 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  {editingId === root.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        placeholder="名称"
                        className="w-full px-3 py-1 bg-surface-container-highest border border-outline/20 rounded-lg text-on-surface"
                      />
                      <input
                        type="text"
                        value={editingPath}
                        onChange={(event) => setEditingPath(event.target.value)}
                        placeholder="路径"
                        className="w-full px-3 py-1 bg-surface-container-highest border border-outline/20 rounded-lg text-on-surface text-sm"
                      />
                    </div>
                  ) : (
                    <>
                      <p className="font-bold text-on-surface">{root.name}</p>
                      <p className="text-sm text-outline">{root.path}</p>
                      <p className="text-xs text-outline/70 mt-1">最后扫描: {formatLibraryRootScanTime(root.lastScannedAt)}</p>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {editingId === root.id ? (
                  <>
                    <button onClick={saveEdit} className="p-2 text-green-500 hover:text-green-400 transition-colors" title="保存">
                      <Check className="w-5 h-5" />
                    </button>
                    <button onClick={cancelEdit} className="p-2 text-red-500 hover:text-red-400 transition-colors" title="取消">
                      <X className="w-5 h-5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => startEdit(root)} className="p-2 text-outline hover:text-primary transition-colors" title="编辑">
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => scanLibraryRoot(root.id)}
                      disabled={isScanning(root.id)}
                      className="p-2 text-outline hover:text-primary transition-colors disabled:opacity-50"
                      title="扫描此目录"
                    >
                      <RefreshCw className={`w-5 h-5 ${isScanning(root.id) ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={() => deleteRoot(root.id)} className="p-2 text-outline hover:text-error transition-colors" title="删除">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </>
);
