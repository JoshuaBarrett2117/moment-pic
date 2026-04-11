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
import { useLibraryRoots, useLibraryScan, useSystemConfig } from '../hooks';

interface SettingsScreenProps {
  onBack: () => void;
}

const VIEWER_PRELOAD_RADIUS_KEY = 'moment_pic_viewer_preload_radius';
const DEFAULT_VIEWER_PRELOAD_RADIUS = 10;

const clampPreloadRadius = (value: number): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_VIEWER_PRELOAD_RADIUS;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
};

export const SettingsScreen: FC<SettingsScreenProps> = ({ onBack }) => {
  const { libraryRoots, isLoading, error, fetchLibraryRoots, addLibraryRoot, updateLibraryRoot, deleteLibraryRoot } = useLibraryRoots();
  const { isScanning, scan, scanningLibraryRootIds } = useLibraryScan();
  const { systemConfig, fetchSystemConfig, updateSystemConfig } = useSystemConfig();
  const [activeTab, setActiveTab] = useState<'basic' | 'advanced'>('basic');
  const [newPath, setNewPath] = useState('');
  const [newName, setNewName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [viewerPreloadRadius, setViewerPreloadRadius] = useState(DEFAULT_VIEWER_PRELOAD_RADIUS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingPath, setEditingPath] = useState('');
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  useEffect(() => {
    void fetchLibraryRoots();
  }, [fetchLibraryRoots]);

  useEffect(() => {
    void fetchSystemConfig();
  }, [fetchSystemConfig]);

  const isAnyScanning = scanningLibraryRootIds.size > 0;

  useEffect(() => {
    const savedValue = window.localStorage.getItem(VIEWER_PRELOAD_RADIUS_KEY);
    setViewerPreloadRadius(clampPreloadRadius(Number(savedValue ?? DEFAULT_VIEWER_PRELOAD_RADIUS)));
  }, []);

  const handleAddRoot = async () => {
    if (!newPath.trim()) {
      return;
    }

    setIsAdding(true);
    const result = await addLibraryRoot(newPath.trim(), newName.trim() || undefined);
    if (result) {
      setNewPath('');
      setNewName('');
    }
    setIsAdding(false);
  };

  const handleScan = async (libraryRootId?: string) => {
    await scan(libraryRootId);
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除这个库目录吗？')) {
      await deleteLibraryRoot(id);
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
    await updateLibraryRoot(editingId, { name: editingName, path: editingPath });
    setEditingId(null);
    setEditingName('');
    setEditingPath('');
  };

  const handleViewerPreloadRadiusChange = (value: string) => {
    const nextValue = clampPreloadRadius(Number(value));
    setViewerPreloadRadius(nextValue);
    window.localStorage.setItem(VIEWER_PRELOAD_RADIUS_KEY, String(nextValue));
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) {
      return '从未扫描';
    }

    return new Date(dateStr).toLocaleString('zh-CN');
  };

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <aside className="w-80 bg-surface-container-low p-8 flex flex-col border-r border-outline/5">
        <div className="mb-10 flex items-center gap-3">
          <Database className="text-on-primary-container w-8 h-8" />
          <h1 className="text-2xl font-bold text-on-primary-container font-script">设置</h1>
        </div>

        <nav className="flex flex-col gap-4">
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
        </nav>
      </aside>

      <main className="flex-1 p-12 overflow-y-auto custom-scrollbar">
        {activeTab === 'basic' && (
          <>
            <header className="mb-12">
              <h2 className="text-4xl font-headline font-black text-on-surface">基础设置</h2>
              <p className="text-outline mt-2">配置图片库目录，并管理查看器相关设置</p>
            </header>

            {error && (
              <div className="mb-6 p-4 bg-error-container text-on-error-container rounded-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                {error}
              </div>
            )}

            <div className="bg-surface-container-highest rounded-2xl p-6 mb-8">
              <h3 className="text-lg font-bold text-on-surface mb-4">图片预览</h3>
              <div className="flex items-start gap-4 rounded-xl bg-surface-container-high p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container">
                  <Images className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-bold text-on-surface">图片预加载张数</p>
                      <p className="mt-1 text-sm text-outline">查看大图时，预先准备当前图片前后相邻的图片数量</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={viewerPreloadRadius}
                        onChange={(event) => handleViewerPreloadRadiusChange(event.target.value)}
                        className="w-24 rounded-xl border-2 border-outline/20 bg-surface px-3 py-2 text-center font-semibold text-on-surface outline-none focus:border-primary"
                      />
                      <span className="text-sm text-outline">张</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-surface-container-highest rounded-2xl p-6 mb-8">
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

            <div className="bg-surface-container-highest rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
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
                    <div key={root.id} className="flex items-center justify-between p-4 bg-surface-container-high rounded-xl">
                      <div className="flex items-center gap-4">
                        <Folder className="w-10 h-10 text-primary" />
                        <div className="flex-1">
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
            <header className="mb-12">
              <h2 className="text-4xl font-headline font-black text-on-surface">高级设置</h2>
              <p className="text-outline mt-2">配置目录监控和轮询相关的系统级参数</p>
            </header>

            <div className="bg-surface-container-highest rounded-2xl p-6 mb-8">
              <h3 className="text-lg font-bold text-on-surface mb-4">目录监控</h3>
              <div className="space-y-6">
                <div className="flex items-start gap-4 rounded-xl bg-surface-container-high p-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container">
                    <Clock className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-bold text-on-surface">启用轮询模式</p>
                        <p className="mt-1 text-sm text-outline">适用于网络驱动器（如 NAS）或无法使用系统通知的场景</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={systemConfig?.enablePolling ?? false}
                          onChange={async (e) => {
                            setIsSavingConfig(true);
                            await updateSystemConfig({ enablePolling: e.target.checked });
                            setIsSavingConfig(false);
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
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container">
                      <Settings className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-4">
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
                                setIsSavingConfig(true);
                                await updateSystemConfig({ pollingInterval: value });
                                setIsSavingConfig(false);
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
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};
