import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ImageOff } from 'lucide-react';
import { ThrottledImage } from './ThrottledImage';

interface PolaroidProps {
  src: string;
  alt?: string;
  caption?: string;
  date?: string;
  rotation?: number;
  className?: string;
  onClick?: () => void;
}

export const Polaroid: React.FC<PolaroidProps> = ({ 
  src, 
  alt = '', 
  caption, 
  date, 
  rotation = 0, 
  className = '',
  onClick
}) => {
  const [hasError, setHasError] = useState(false);

  return (
    <motion.div
      whileHover={{ scale: 1.05, rotate: 0, zIndex: 30 }}
      initial={{ rotate: rotation }}
      className={`polaroid cursor-pointer transition-transform duration-500 ${className}`}
      onClick={onClick}
    >
      <div className="relative overflow-hidden aspect-square rounded-sm mb-4">
        {hasError ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-surface-container text-outline">
            <ImageOff className="h-8 w-8" />
            <span className="text-xs font-medium tracking-wide">预览不可用</span>
          </div>
        ) : (
          <ThrottledImage
            src={src} 
            alt={alt} 
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
            onError={() => setHasError(true)}
          />
        )}
      </div>
      {(caption || date) && (
        <div className="text-center">
          {caption && <span className="font-headline font-black text-xl text-on-primary-container block">{caption}</span>}
          {date && <p className="text-xs text-outline font-label mt-1">{date}</p>}
        </div>
      )}
    </motion.div>
  );
};
