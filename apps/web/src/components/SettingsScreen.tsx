import type { FC } from 'react';
import { useEffect, useState } from 'react';

import { useLibraryRoots, useLibraryScan, useSettingsConfigForm } from '../hooks';
import { SmartAlbumSettingsPanel } from './SmartAlbumSettingsPanel';
import { SettingsAdvancedPanel } from './SettingsAdvancedPanel';
import { SettingsBasicPanel } from './SettingsBasicPanel';
import { SettingsSidebar, type SettingsTab } from './SettingsSidebar';

interface SettingsScreenProps {
  onBack: () => void;
  onScanComplete?: () => void | Promise<void>;
  onSystemConfigChange?: () => void | Promise<void>;
}

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
  const [activeTab, setActiveTab] = useState<SettingsTab>('basic');
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
    }
    setIsAdding(false);
  };

  const handleScan = async (libraryRootId?: string) => {
    await scan(libraryRootId);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个库目录吗？')) {
      return;
    }

    await deleteLibraryRoot(id);
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
    if (!editingId) {
      return;
    }

    const result = await updateLibraryRoot(editingId, { name: editingName, path: editingPath });
    if (!result) {
      return;
    }

    handleEditCancel();
  };

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] w-full bg-background overflow-hidden">
      <SettingsSidebar activeTab={activeTab} onBack={onBack} onTabChange={setActiveTab} />

      <main className="flex-1 p-4 md:p-12 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] overflow-y-auto custom-scrollbar">
        {activeTab === 'basic' && (
          <SettingsBasicPanel
            addLibraryRoot={handleAddRoot}
            defaultImageQualityPreset={defaultImageQualityPreset}
            editingId={editingId}
            editingName={editingName}
            editingPath={editingPath}
            error={error}
            isAdding={isAdding}
            isAnyScanning={isAnyScanning}
            isLoading={isLoading}
            isSavingConfig={isSavingConfig}
            isScanning={isScanning}
            libraryRoots={libraryRoots}
            newName={newName}
            newPath={newPath}
            onSystemConfigChange={onSystemConfigChange}
            pageTransitionMode={pageTransitionMode}
            preloadAfter={preloadAfter}
            preloadBefore={preloadBefore}
            saveConfig={saveConfig}
            saveDefaultImageQualityPreset={saveDefaultImageQualityPreset}
            savePageTransitionMode={savePageTransitionMode}
            saveStatus={saveStatus}
            scanLibraryRoot={handleScan}
            setEditingName={setEditingName}
            setEditingPath={setEditingPath}
            setNewName={setNewName}
            setNewPath={setNewPath}
            systemConfig={systemConfig}
            updatePreloadRadius={handleViewerPreloadRadiusChange}
            cancelEdit={handleEditCancel}
            deleteRoot={handleDelete}
            saveEdit={handleEditSave}
            startEdit={handleEditStart}
          />
        )}

        {activeTab === 'advanced' && (
          <SettingsAdvancedPanel
            albumDetailItemMinWidthDesktop={albumDetailItemMinWidthDesktop}
            albumDetailItemMinWidthMobile={albumDetailItemMinWidthMobile}
            albumListItemMinWidthDesktop={albumListItemMinWidthDesktop}
            albumListItemMinWidthMobile={albumListItemMinWidthMobile}
            isSavingConfig={isSavingConfig}
            saveConfig={saveConfig}
            saveStatus={saveStatus}
            setAlbumDetailItemMinWidthDesktop={setAlbumDetailItemMinWidthDesktop}
            setAlbumDetailItemMinWidthMobile={setAlbumDetailItemMinWidthMobile}
            setAlbumListItemMinWidthDesktop={setAlbumListItemMinWidthDesktop}
            setAlbumListItemMinWidthMobile={setAlbumListItemMinWidthMobile}
            systemConfig={systemConfig}
          />
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
