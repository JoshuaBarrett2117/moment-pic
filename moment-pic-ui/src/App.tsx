/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Screen } from './types';
import { LoginScreen } from './components/LoginScreen';
import { GalleryScreen } from './components/GalleryScreen';
import { LocalGalleryScreen } from './components/LocalGalleryScreen';
import { AlbumDetailScreen } from './components/AlbumDetailScreen';
import { PaperGrain } from './components/PaperGrain';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>(Screen.LOGIN);
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);
  const [direction, setDirection] = useState(1); // 1 for forward, -1 for backward

  const navigate = (screen: Screen, dir: number = 1) => {
    setDirection(dir);
    setCurrentScreen(screen);
  };

  const handleLogin = () => {
    navigate(Screen.GALLERY, 1);
  };

  const handleNavigateToAlbum = (albumId: string) => {
    if (albumId === '00834-黑兔之旅') {
      setSelectedAlbum(albumId);
      navigate(Screen.ALBUM_DETAIL, 1);
    } else {
      navigate(Screen.LOCAL_GALLERY, 1);
    }
  };

  const handleNavigateToLocalGallery = () => {
    navigate(Screen.LOCAL_GALLERY, 1);
  };

  const handleProfileClick = () => {
    navigate(Screen.LOGIN, -1);
  };

  const handleBackToGallery = () => {
    navigate(Screen.GALLERY, -1);
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
          {currentScreen === Screen.LOGIN && (
            <LoginScreen onLogin={handleLogin} />
          )}
          {currentScreen === Screen.GALLERY && (
            <GalleryScreen 
              onNavigateToAlbum={handleNavigateToAlbum}
              onNavigateToLocalGallery={handleNavigateToLocalGallery}
              onProfileClick={handleProfileClick}
            />
          )}
          {currentScreen === Screen.LOCAL_GALLERY && (
            <LocalGalleryScreen 
              onBack={handleBackToGallery}
              onNavigateToGallery={handleBackToGallery}
            />
          )}
          {currentScreen === Screen.ALBUM_DETAIL && (
            <AlbumDetailScreen 
              albumId={selectedAlbum || ''} 
              onBack={handleBackToGallery} 
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
