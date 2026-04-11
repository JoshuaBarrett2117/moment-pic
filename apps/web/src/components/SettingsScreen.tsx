import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { 
  FolderPlus, Trash2, RefreshCw, Plus, Loader2, 
  Folder, Database, CheckCircle, XCircle, AlertCircle 
} from 'lucide-react';
import { WobblyButton } from './WobblyButton';
import { useLibraryRoots, useScan } from '../hooks';
interface SettingsScreenProps {
  onBack: () => void;
}

export const SettingsScreen: FC<SettingsScreenProps> = ({ onBack }) => {
  const { libraryRoots, isLoading, error, fetchLibraryRoots, addLibraryRoot, deleteLibraryRoot } = useLibraryRoots();
  const { scan, currentScanTask, isScanning } = useScan();
  const [newPath, setNewPath] = useState('');
  const [newName, setNewName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    fetchLibraryRoots();
  }, [fetchLibraryRoots]);

  useEffect(() => {
    if (currentScanTask?.status === 'completed') {
      void fetchLibraryRoots();
    }
  }, [currentScanTask?.status, fetchLibraryRoots]);

  const handleAddRoot = async () => {
    if (!newPath.trim()) return;
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

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '从未扫描';
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
        </nav>
      </aside>

      <main className="flex-1 p-12 overflow-y-auto custom-scrollbar">
        <header className="mb-12">
          <h2 className="text-4xl font-headline font-black text-on-surface">库目录管理</h2>
          <p className="text-outline mt-2">配置图片库目录并执行扫描</p>
        </header>

        {error && (
          <div className="mb-6 p-4 bg-error-container text-on-error-container rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {currentScanTask && (
          <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
            currentScanTask.status === 'completed' ? 'bg-green-100 text-green-800' :
            currentScanTask.status === 'failed' ? 'bg-red-100 text-red-800' :
            'bg-blue-100 text-blue-800'
          }`}>
            {isScanning ? <Loader2 className="w-5 h-5 animate-spin" /> :
              currentScanTask.status === 'completed' ? <CheckCircle className="w-5 h-5" /> :
              currentScanTask.status === 'failed' ? <XCircle className="w-5 h-5" /> :
              <AlertCircle className="w-5 h-5" />
            }
            <div>
              <p className="font-medium">
                {isScanning ? '扫描中...' : 
                  currentScanTask.status === 'completed' ? '扫描完成' :
                  currentScanTask.status === 'failed' ? '扫描失败' : '等待中'}
              </p>
              {currentScanTask.status === 'completed' && (
                <p className="text-sm">发现 {currentScanTask.albumsDiscovered} 个相册，{currentScanTask.assetsDiscovered} 张图片</p>
              )}
              {currentScanTask.error && (
                <p className="text-sm">{currentScanTask.error}</p>
              )}
            </div>
          </div>
        )}

        <div className="bg-surface-container-highest rounded-2xl p-6 mb-8">
          <h3 className="text-lg font-bold text-on-surface mb-4">添加库目录</h3>
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-outline mb-2">路径</label>
              <input
                type="text"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="例如: /volume1/pb1/photos"
                className="w-full px-4 py-3 bg-surface-container-high border-2 border-outline/20 rounded-xl focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-outline mb-2">名称（可选）</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="例如: 我的照片"
                className="w-full px-4 py-3 bg-surface-container-high border-2 border-outline/20 rounded-xl focus:border-primary focus:outline-none"
              />
            </div>
            <WobblyButton 
              onClick={handleAddRoot} 
              disabled={!newPath.trim() || isAdding}
              className="self-start"
            >
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
              disabled={isScanning}
              className="flex items-center gap-2 px-4 py-2 bg-primary-container text-on-primary-container rounded-lg hover:brightness-95 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
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
                <div 
                  key={root.id}
                  className="flex items-center justify-between p-4 bg-surface-container-high rounded-xl"
                >
                  <div className="flex items-center gap-4">
                    <Folder className="w-10 h-10 text-primary" />
                    <div>
                      <p className="font-bold text-on-surface">{root.name}</p>
                      <p className="text-sm text-outline">{root.path}</p>
                      <p className="text-xs text-outline/70 mt-1">
                        最后扫描: {formatDate(root.lastScannedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleScan(root.id)}
                      disabled={isScanning}
                      className="p-2 text-outline hover:text-primary transition-colors disabled:opacity-50"
                      title="扫描此目录"
                    >
                      <RefreshCw className={`w-5 h-5 ${isScanning ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      onClick={() => handleDelete(root.id)}
                      className="p-2 text-outline hover:text-error transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
