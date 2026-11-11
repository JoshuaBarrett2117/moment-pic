import type { FC } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { useLibraryRoots, useLibraryScan, useSettingsConfigForm } from '../hooks';
import { SmartAlbumSettingsPanel } from './SmartAlbumSettingsPanel';
import { SettingsAdvancedPanel } from './SettingsAdvancedPanel';
import { SettingsBasicPanel } from './SettingsBasicPanel';
import { SettingsTabs, type SettingsTab } from './SettingsTabs';
import { Sidebar } from './Sidebar';
import { GalleryHeader } from './gallery/GalleryHeader';
import { SettingsAccountPanel } from './SettingsAccountPanel';
import { SettingsUsersPanel } from './SettingsUsersPanel';
import { SettingsAppearancePanel } from './SettingsAppearancePanel';
import { useCurrentUser } from '../app/current-user';

interface SettingsScreenProps {
  scanError?: string | null;
  onBack?: () => void;
  onScanComplete?: () => void | Promise<void>;
  onSystemConfigChange?: () => void | Promise<void>;
}

export const SettingsScreen: FC<SettingsScreenProps> = ({ onScanComplete, onSystemConfigChange, scanError }) => {
  const { libraryRoots, isLoading, error, fetchLibraryRoots, addLibraryRoot, updateLibraryRoot, deleteLibraryRoot } = useLibraryRoots();
  const refreshAfterScan = useCallback(async () => {
    await fetchLibraryRoots();
    await onScanComplete?.();
  }, [fetchLibraryRoots, onScanComplete]);
  const { isScanning, scan, isAnyScanning, scanError: localScanError } = useLibraryScan({
    onScanComplete: refreshAfterScan
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
  const { isAdmin } = useCurrentUser();
  const [selectedTab, setActiveTab] = useState<SettingsTab>('basic');
  // 只读用户只能看到“账号”页
  const activeTab: SettingsTab = isAdmin || selectedTab === 'appearance' ? selectedTab : 'account';
  const [newPath, setNewPath] = useState('');
  const [newName, setNewName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingPath, setEditingPath] = useState('');

  useEffect(() => {
    void fetchLibraryRoots();
  }, [fetchLibraryRoots]);

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
    <div className="flex h-[100dvh] w-full overflow-hidden">
      <Sidebar />

      <main className="mp-with-sidebar custom-scrollbar relative h-full flex-1 overflow-y-auto px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] md:px-10 md:pt-9 xl:px-12">
        <GalleryHeader eyebrow="Settings" title="设置" />
        <SettingsTabs activeTab={activeTab} onTabChange={setActiveTab} isAdmin={isAdmin} />
        {(localScanError || scanError) && <div role="alert" className="mb-4 rounded-lg border border-error/30 bg-error/10 p-4 text-error">{localScanError ?? scanError}</div>}
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
            <header className="mb-6 md:mb-8">
              <h2 className="mp-title text-xl md:text-2xl">智能相册</h2>
              <p className="text-outline mt-2 text-sm md:text-base">配置智能相册的归纳规则，并为 AI 自动归纳准备策略。</p>
            </header>

            <SmartAlbumSettingsPanel onRebuildComplete={onScanComplete} />
          </>
        )}

        {activeTab === 'account' && <SettingsAccountPanel />}
        {activeTab === 'users' && isAdmin && <SettingsUsersPanel />}
        {activeTab === 'appearance' && <SettingsAppearancePanel />}
      </main>
    </div>
  );
};
