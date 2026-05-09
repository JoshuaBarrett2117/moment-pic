import type { FC } from 'react';
import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  Clock,
  Database,
  Edit2,
  Folder,
  Images,
  Loader2,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import { WobblyButton } from './WobblyButton';
import { useToast } from './Toast';
import { useLibraryRoots, useLibraryScan, useSettingsConfigForm } from '../hooks';
import { SmartAlbumSettingsPanel } from './SmartAlbumSettingsPanel';

interface SettingsScreenProps {
  onBack: () => void;
  onScanComplete?: () => void | Promise<void>;
  onSystemConfigChange?: () => void | Promise<void>;
}

const clampGridWidth = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 160;
  }

  return Math.max(180, Math.min(600, Math.round(value)));
};

export const SettingsScreen: FC<SettingsScreenProps> = ({ onBack, onScanComplete, onSystemConfigChange }) => {
  const { libraryRoots, isLoading, error, fetchLibraryRoots, addLibraryRoot, updateLibraryRoot, deleteLibraryRoot } = useLibraryRoots();
  const { isScanning, scan, scanningLibraryRootIds } = useLibraryScan({
    onScanComplete
  });
  const {
    albumDetailItemMinWidthDesktop,
    albumDetailItemMinWidthMobile,
    albumListItemMinWidthDesktop,
    albumListItemMinWidthMobile,
    defaultImageQualityPreset,
    handleViewerPreloadRadiusChange,
    isSavingConfig,
    pageTransitionMode,
    preloadAfter,
    preloadBefore,
    saveConfig,
    saveDefaultImageQualityPreset,
    savePageTransitionMode,
    saveStatus,
    setAlbumDetailItemMinWidthDesktop,
    setAlbumDetailItemMinWidthMobile,
    setAlbumListItemMinWidthDesktop,
    setAlbumListItemMinWidthMobile,
    systemConfig
  } = useSettingsConfigForm();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'basic' | 'advanced' | 'smart'>('basic');
  const [newPath, setNewPath] = useState('');
  const [newName, setNewName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingPath, setEditingPath] = useState('');

  useEffect(() => {
    void fetchLibraryRoots();
  }, [fetchLibraryRoots]);

  const isAnyScanning = scanningLibraryRootIds.size > 0;

  const handleAddRoot = async () => {
    if (!newPath.trim()) {
      return;
    }

    setIsAdding(true);
    const result = await addLibraryRoot(newPath.trim(), newName.trim() || undefined);
    if (result) {
      setNewPath('');
      setNewName('');
      toast('库目录添加成功', 'success');
    } else {
      toast('添加失败，请检查路径是否正确', 'error');
    }
    setIsAdding(false);
  };

  const handleScan = async (libraryRootId?: string) => {
    toast(libraryRootId ? '正在扫描该图库...' : '正在扫描全部图库...', 'info');
    await scan(libraryRootId);
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除这个库目录吗？')) {
      const success = await deleteLibraryRoot(id);
      if (success) {
        toast('库目录已删除', 'success');
        return;
      }

      toast('删除失败，请稍后重试', 'error');
    }
  };

  const handleEditStart = (root: { id: string; name: string; path: string }) => {
    setEditingId(root.id);
    setEditingName(root.name);
    setEditingPath(root.path);
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditingName('');
    setEditingPath('');
  };

  const handleEditSave = async () => {
    if (!editingId) return;
    const result = await updateLibraryRoot(editingId, { name: editingName, path: editingPath });
    if (!result) {
      toast('修改保存失败，请检查路径后重试', 'error');
      return;
    }

    setEditingId(null);
    setEditingName('');
    setEditingPath('');
    toast('修改已保存', 'success');
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) {
      return '从未扫描';
    }

    return new Date(dateStr).toLocaleString('zh-CN');
  };

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] w-full bg-background overflow-hidden">
      <aside className="w-full md:w-80 bg-surface-container-low p-3 md:p-8 flex flex-row md:flex-col border-b md:border-b-0 md:border-r border-outline/5 overflow-x-auto shrink-0 z-20 items-center md:items-stretch scrollbar-hide">
        <div className="md:mb-10 mr-6 md:mr-0 flex items-center gap-2 md:gap-3 shrink-0">
          <Database className="text-on-primary-container w-6 h-6 md:w-8 md:h-8" />
          <h1 className="text-xl md:text-2xl font-bold text-on-primary-container font-script">设置</h1>
        </div>

        <nav className="flex flex-row md:flex-col gap-2 md:gap-4 shrink-0">
          <button
            onClick={onBack}
            className="flex items-center gap-3 text-outline hover:text-on-primary-container font-headline font-semibold px-4 py-2 rounded-lg hover:bg-primary-container/10 transition-all"
          >
            <RefreshCw className="w-5 h-5" />
            <span>返回</span>
          </button>
          <button
            onClick={() => setActiveTab('basic')}
            className={`flex items-center gap-3 font-headline font-semibold px-4 py-2 rounded-lg transition-all ${
              activeTab === 'basic'
                ? 'bg-primary-container text-on-primary-container'
                : 'text-outline hover:text-on-primary-container hover:bg-primary-container/10'
            }`}
          >
            <Images className="w-5 h-5" />
            <span>基础设置</span>
          </button>
          <button
            onClick={() => setActiveTab('advanced')}
            className={`flex items-center gap-3 font-headline font-semibold px-4 py-2 rounded-lg transition-all ${
              activeTab === 'advanced'
                ? 'bg-primary-container text-on-primary-container'
                : 'text-outline hover:text-on-primary-container hover:bg-primary-container/10'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span>高级设置</span>
          </button>
          <button
            onClick={() => setActiveTab('smart')}
            className={`flex items-center gap-3 font-headline font-semibold px-4 py-2 rounded-lg transition-all ${
              activeTab === 'smart'
                ? 'bg-primary-container text-on-primary-container'
                : 'text-outline hover:text-on-primary-container hover:bg-primary-container/10'
            }`}
          >
            <Images className="w-5 h-5" />
            <span>智能归纳</span>
          </button>
        </nav>
      </aside>

      <main className="flex-1 p-4 md:p-12 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] overflow-y-auto custom-scrollbar">
        {activeTab === 'basic' && (
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
                      <div className="flex items-center gap-3">
                        <select
                          value={pageTransitionMode}
                          onChange={async (event) => {
                            const didSave = await savePageTransitionMode(event.target.value as 'page' | 'normal');
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
                      <div className="flex items-center gap-3">
                        <select
                          value={defaultImageQualityPreset}
                          onChange={async (event) => {
                            const nextPreset = event.target.value as 'low' | 'balanced' | 'high' | 'original';
                            await saveDefaultImageQualityPreset(nextPreset);
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
                            onChange={(event) => handleViewerPreloadRadiusChange(event.target.value, 'before')}
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
                            onChange={(event) => handleViewerPreloadRadiusChange(event.target.value, 'after')}
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
                <WobblyButton onClick={handleAddRoot} disabled={!newPath.trim() || isAdding} className="self-start">
                  {isAdding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                  添加目录
                </WobblyButton>
              </div>
            </div>

            <div className="bg-surface-container-highest rounded-2xl p-4 md:p-6 mb-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <h3 className="text-lg font-bold text-on-surface">库目录列表</h3>
                <button
                  onClick={() => handleScan()}
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
                                onChange={(e) => setEditingName(e.target.value)}
                                placeholder="名称"
                                className="w-full px-3 py-1 bg-surface-container-highest border border-outline/20 rounded-lg text-on-surface"
                              />
                              <input
                                type="text"
                                value={editingPath}
                                onChange={(e) => setEditingPath(e.target.value)}
                                placeholder="路径"
                                className="w-full px-3 py-1 bg-surface-container-highest border border-outline/20 rounded-lg text-on-surface text-sm"
                              />
                            </div>
                          ) : (
                            <>
                              <p className="font-bold text-on-surface">{root.name}</p>
                              <p className="text-sm text-outline">{root.path}</p>
                              <p className="text-xs text-outline/70 mt-1">最后扫描: {formatDate(root.lastScannedAt)}</p>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {editingId === root.id ? (
                          <>
                            <button
                              onClick={handleEditSave}
                              className="p-2 text-green-500 hover:text-green-400 transition-colors"
                              title="保存"
                            >
                              <Check className="w-5 h-5" />
                            </button>
                            <button
                              onClick={handleEditCancel}
                              className="p-2 text-red-500 hover:text-red-400 transition-colors"
                              title="取消"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleEditStart(root)}
                              className="p-2 text-outline hover:text-primary transition-colors"
                              title="编辑"
                            >
                              <Edit2 className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleScan(root.id)}
                              disabled={isScanning(root.id)}
                              className="p-2 text-outline hover:text-primary transition-colors disabled:opacity-50"
                              title="扫描此目录"
                            >
                              <RefreshCw className={`w-5 h-5 ${isScanning(root.id) ? 'animate-spin' : ''}`} />
                            </button>
                            <button
                              onClick={() => handleDelete(root.id)}
                              className="p-2 text-outline hover:text-error transition-colors"
                              title="删除"
                            >
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
        )}

        {activeTab === 'advanced' && (
          <>
            <header className="mb-6 md:mb-12">
              <h2 className="text-2xl md:text-4xl font-headline font-black text-on-surface">高级设置</h2>
              <p className="text-outline mt-2 text-sm md:text-base">配置目录监控和轮询相关的系统级参数</p>
              <p className="mt-3 text-sm text-outline/80">
                {saveStatus === 'saving' && '正在保存设置...'}
                {saveStatus === 'saved' && '设置已自动保存'}
                {saveStatus === 'error' && '设置保存失败，请稍后重试'}
                {saveStatus === 'idle' && '开关会立即生效，数值会自动保存'}
              </p>
            </header>

            <div className="bg-surface-container-highest rounded-2xl p-6 mb-8">
              <h3 className="text-lg font-bold text-on-surface mb-4">目录监控</h3>
              <div className="space-y-6">
                <div className="flex items-start gap-4 rounded-xl bg-surface-container-high p-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container shrink-0">
                    <Clock className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <p className="font-bold text-on-surface">启用轮询模式</p>
                        <p className="mt-1 text-sm text-outline">适用于网络驱动器（如 NAS）或无法使用系统通知的场景</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={systemConfig?.enablePolling ?? true}
                          onChange={async (e) => {
                            await saveConfig({ enablePolling: e.target.checked });
                          }}
                          disabled={isSavingConfig}
                          className="sr-only peer"
                        />
                        <div className="w-14 h-7 bg-outline/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-primary"></div>
                      </label>
                    </div>
                  </div>
                </div>

                {systemConfig?.enablePolling && (
                  <div className="flex items-start gap-4 rounded-xl bg-surface-container-high p-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container shrink-0">
                      <Settings className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <p className="font-bold text-on-surface">轮询间隔</p>
                          <p className="mt-1 text-sm text-outline">每次检查文件变化的时间间隔</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            min="5000"
                            max="600000"
                            step="1000"
                            value={systemConfig?.pollingInterval ?? 60000}
                            onChange={async (e) => {
                              const value = Number(e.target.value);
                              if (value >= 5000 && value <= 600000) {
                                await saveConfig({ pollingInterval: value });
                              }
                            }}
                            disabled={isSavingConfig}
                            className="w-28 rounded-xl border-2 border-outline/20 bg-surface px-3 py-2 text-center font-semibold text-on-surface outline-none focus:border-primary disabled:opacity-50"
                          />
                          <span className="text-sm text-outline">毫秒</span>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-outline/70">
                        推荐值：30000-120000 毫秒（30秒-2分钟）。间隔过短会增加系统负载。
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex items-start gap-4 rounded-xl bg-surface-container-high p-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container shrink-0">
                      <Images className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col gap-4">
                        <div>
                          <p className="font-bold text-on-surface">相册页卡片宽度</p>
                          <p className="text-sm text-outline">分别控制移动端和桌面端的图集卡片最小宽度</p>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="flex items-center justify-between gap-3 rounded-xl bg-surface p-3">
                            <div>
                              <p className="text-sm font-semibold text-on-surface">移动端</p>
                              <p className="text-xs text-outline">手机和平板窄屏</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="180"
                                max="600"
                                step="10"
                                value={albumListItemMinWidthMobile}
                                onChange={(event) => setAlbumListItemMinWidthMobile(clampGridWidth(Number(event.target.value)))}
                                onBlur={async () => {
                                  if (systemConfig) {
                                    await saveConfig({ albumListItemMinWidthMobile });
                                  }
                                }}
                                disabled={isSavingConfig}
                                className="w-24 rounded-xl border-2 border-outline/20 bg-surface-container-highest px-3 py-2 text-center font-semibold text-on-surface outline-none focus:border-primary disabled:opacity-50"
                              />
                              <span className="text-sm text-outline">px</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-3 rounded-xl bg-surface p-3">
                            <div>
                              <p className="text-sm font-semibold text-on-surface">桌面端</p>
                              <p className="text-xs text-outline">大屏和桌面浏览器</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="180"
                                max="600"
                                step="10"
                                value={albumListItemMinWidthDesktop}
                                onChange={(event) => setAlbumListItemMinWidthDesktop(clampGridWidth(Number(event.target.value)))}
                                onBlur={async () => {
                                  if (systemConfig) {
                                    await saveConfig({ albumListItemMinWidthDesktop });
                                  }
                                }}
                                disabled={isSavingConfig}
                                className="w-24 rounded-xl border-2 border-outline/20 bg-surface-container-highest px-3 py-2 text-center font-semibold text-on-surface outline-none focus:border-primary disabled:opacity-50"
                              />
                              <span className="text-sm text-outline">px</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 rounded-xl bg-surface-container-high p-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container shrink-0">
                      <Images className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col gap-4">
                        <div>
                          <p className="font-bold text-on-surface">相册详情页卡片宽度</p>
                          <p className="text-sm text-outline">分别控制移动端和桌面端的图片卡片最小宽度</p>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="flex items-center justify-between gap-3 rounded-xl bg-surface p-3">
                            <div>
                              <p className="text-sm font-semibold text-on-surface">移动端</p>
                              <p className="text-xs text-outline">手机和平板窄屏</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="180"
                                max="600"
                                step="10"
                                value={albumDetailItemMinWidthMobile}
                                onChange={(event) => setAlbumDetailItemMinWidthMobile(clampGridWidth(Number(event.target.value)))}
                                onBlur={async () => {
                                  if (systemConfig) {
                                    await saveConfig({ albumDetailItemMinWidthMobile });
                                  }
                                }}
                                disabled={isSavingConfig}
                                className="w-24 rounded-xl border-2 border-outline/20 bg-surface-container-highest px-3 py-2 text-center font-semibold text-on-surface outline-none focus:border-primary disabled:opacity-50"
                              />
                              <span className="text-sm text-outline">px</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-3 rounded-xl bg-surface p-3">
                            <div>
                              <p className="text-sm font-semibold text-on-surface">桌面端</p>
                              <p className="text-xs text-outline">大屏和桌面浏览器</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="180"
                                max="600"
                                step="10"
                                value={albumDetailItemMinWidthDesktop}
                                onChange={(event) => setAlbumDetailItemMinWidthDesktop(clampGridWidth(Number(event.target.value)))}
                                onBlur={async () => {
                                  if (systemConfig) {
                                    await saveConfig({ albumDetailItemMinWidthDesktop });
                                  }
                                }}
                                disabled={isSavingConfig}
                                className="w-24 rounded-xl border-2 border-outline/20 bg-surface-container-highest px-3 py-2 text-center font-semibold text-on-surface outline-none focus:border-primary disabled:opacity-50"
                              />
                              <span className="text-sm text-outline">px</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'smart' && (
          <>
            <header className="mb-6 md:mb-12">
              <h2 className="text-2xl md:text-4xl font-headline font-black text-on-surface">智能归纳</h2>
              <p className="text-outline mt-2 text-sm md:text-base">配置自动整理归纳规则，并为后续 AI 自动归纳准备策略。</p>
            </header>

            <SmartAlbumSettingsPanel onRebuildComplete={onScanComplete} />
          </>
        )}
      </main>
    </div>
  );
};

