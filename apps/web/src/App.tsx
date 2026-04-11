import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Screen } from './types';
import { LoginScreen } from './components/LoginScreen';
import { GalleryScreen } from './components/GalleryScreen';
import { AlbumDetailScreen } from './components/AlbumDetailScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { PaperGrain } from './components/PaperGrain';
import { useAlbums, useLibraryRoots, useScan } from './hooks';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>(Screen.LOGIN);
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);
  const [direction, setDirection] = useState(1);
  const [activeTab, setActiveTab] = useState<'gallery' | 'settings'>('gallery');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  const [filters, setFilters] = useState({
    page: 1,
    pageSize: 24,
    keyword: '',
    sortBy: 'name' as 'name' | 'updatedAt' | 'assetCount',
    sortOrder: 'asc' as 'asc' | 'desc',
    sourceType: '' as '' | 'folder' | 'zip',
    libraryRootId: '' as string,
  });

  const { albums, isLoading, error, fetchAlbums } = useAlbums();
  const { libraryRoots, fetchLibraryRoots } = useLibraryRoots();
  const { scan, currentScanTask, isScanning } = useScan();

  const loadAlbums = useCallback(() => {
    fetchAlbums({
      page: filters.page,
      pageSize: filters.pageSize,
      keyword: filters.keyword || undefined,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      sourceType: filters.sourceType || undefined,
      libraryRootId: filters.libraryRootId || undefined,
    });
  }, [fetchAlbums, filters.page, filters.pageSize, filters.keyword, filters.sortBy, filters.sortOrder, filters.sourceType, filters.libraryRootId]);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      setIsAuthenticated(true);
      setCurrentScreen(Screen.GALLERY);
    }
  }, []);

  useEffect(() => {
    if (currentScreen === Screen.GALLERY && isAuthenticated) {
      fetchLibraryRoots();
      loadAlbums();
    }
  }, [currentScreen, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      loadAlbums();
    }
  }, [filters.page, filters.pageSize, filters.keyword, filters.sortBy, filters.sortOrder, filters.sourceType, filters.libraryRootId]);

  const navigate = (screen: Screen, dir: number = 1) => {
    setDirection(dir);
    setCurrentScreen(screen);
  };

  const handleLogin = () => {
    setIsAuthenticated(true);
    localStorage.setItem('auth_token', 'authenticated');
    navigate(Screen.GALLERY, 1);
  };

  const handleNavigateToAlbum = (albumId: string) => {
    setSelectedAlbum(albumId);
    navigate(Screen.ALBUM_DETAIL, 1);
  };

  const handleProfileClick = () => {
    localStorage.removeItem('auth_token');
    setIsAuthenticated(false);
    navigate(Screen.LOGIN, -1);
  };

  const handleBackToGallery = () => {
    setActiveTab('gallery');
    navigate(Screen.GALLERY, -1);
  };

  const handleSidebarNavigate = (tab: 'gallery' | 'settings') => {
    setActiveTab(tab);
    if (tab === 'gallery') {
      navigate(Screen.GALLERY, 1);
    } else if (tab === 'settings') {
      navigate(Screen.SETTINGS, 1);
    }
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  const handleSortByChange = (sortBy: 'name' | 'updatedAt' | 'assetCount') => {
    setFilters(prev => ({ ...prev, sortBy, page: 1 }));
  };

  const handleSortOrderChange = (sortOrder: 'asc' | 'desc') => {
    setFilters(prev => ({ ...prev, sortOrder }));
  };

  const handlePageSizeChange = (pageSize: number) => {
    setFilters(prev => ({ ...prev, pageSize, page: 1 }));
  };

  const handleKeywordChange = (keyword: string) => {
    setFilters(prev => ({ ...prev, keyword, page: 1 }));
  };

  const handleSourceTypeChange = (sourceType: '' | 'folder' | 'zip') => {
    setFilters(prev => ({ ...prev, sourceType, page: 1 }));
  };

  const handleLibraryRootChange = (libraryRootId: string) => {
    setFilters(prev => ({ ...prev, libraryRootId, page: 1 }));
  };

  const handleRefresh = async () => {
    await scan();
  };

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? '100%' : '-100%',
      opacity: 0
    }),
    center: {
      x: 0,
      opacity: 1
    },
    exit: (direction: number) => ({
      x: direction < 0 ? '100%' : '-100%',
      opacity: 0
    })
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-background">
      <PaperGrain />
      
      <AnimatePresence initial={false} custom={direction} mode="wait">
        <motion.div
          key={currentScreen}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            x: { type: "spring", stiffness: 300, damping: 30 },
            opacity: { duration: 0.2 }
          }}
          className="absolute inset-0 w-full h-full"
        >
          {(currentScreen === Screen.LOGIN || !isAuthenticated) && (
            <LoginScreen onLogin={handleLogin} />
          )}
          {currentScreen === Screen.GALLERY && isAuthenticated && (
            <GalleryScreen 
              albums={albums?.items || []}
              isLoading={isLoading}
              pagination={albums?.pagination || null}
              onNavigateToAlbum={handleNavigateToAlbum}
              onProfileClick={handleProfileClick}
              onRefresh={loadAlbums}
              onPageChange={handlePageChange}
              onSortByChange={handleSortByChange}
              onSortOrderChange={handleSortOrderChange}
              onPageSizeChange={handlePageSizeChange}
              onSourceTypeChange={handleSourceTypeChange}
              currentSortBy={filters.sortBy}
              currentSortOrder={filters.sortOrder}
              currentPageSize={filters.pageSize}
              currentSourceType={filters.sourceType}
              currentKeyword={filters.keyword}
              activeTab={activeTab}
              onSidebarNavigate={handleSidebarNavigate}
              libraryRoots={libraryRoots}
              currentLibraryRootId={filters.libraryRootId}
              onLibraryRootChange={handleLibraryRootChange}
              onKeywordChange={handleKeywordChange}
              onScan={handleRefresh}
              isScanning={isScanning}
            />
          )}
          {currentScreen === Screen.ALBUM_DETAIL && (
            <AlbumDetailScreen 
              albumId={selectedAlbum || ''} 
              onBack={handleBackToGallery} 
            />
          )}
          {currentScreen === Screen.SETTINGS && (
            <SettingsScreen 
              onBack={handleBackToGallery}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
