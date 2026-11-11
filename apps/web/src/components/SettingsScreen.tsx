import type { FC } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { useLibraryRoots, useLibraryScan, useSettingsConfigForm } from '../hooks';
import { SmartAlbumSettingsPanel } from './SmartAlbumSettingsPanel';
import { SettingsAdvancedPanel } from './SettingsAdvancedPanel';
import { SettingsBasicPanel } from './SettingsBasicPanel';
import { SettingsSidebar, type SettingsTab } from './SettingsSidebar';
import { SettingsAccountPanel } from './SettingsAccountPanel';
import { SettingsUsersPanel } from './SettingsUsersPanel';
import { SettingsAppearancePanel } from './SettingsAppearancePanel';
import { useCurrentUser } from '../app/current-user';

interface SettingsScreenProps {
  scanError?: string | null;
  onBack: () => void;
  onScanComplete?: () => void | Promise<void>;
  onSystemConfigChange?: () => void | Promise<void>;
}

export const SettingsScreen: FC<SettingsScreenProps> = ({ onBack, onScanComplete, onSystemConfigChange, scanError }) => {
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
    <div className="flex flex-col md:flex-row h-[100dvh] w-full overflow-hidden">
      <SettingsSidebar activeTab={activeTab} onBack={onBack} onTabChange={setActiveTab} isAdmin={isAdmin} />

      <main className="flex-1 p-4 md:p-12 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] overflow-y-auto custom-scrollbar">
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
            <header className="mb-6 md:mb-12">
              <h2 className="text-2xl md:text-4xl font-headline font-bold text-on-surface">智能归纳</h2>
              <p className="text-outline mt-2 text-sm md:text-base">配置自动整理归纳规则，并为后续 AI 自动归纳准备策略。</p>
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
