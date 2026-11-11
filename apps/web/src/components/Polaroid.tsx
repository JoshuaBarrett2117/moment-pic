import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ImageOff } from 'lucide-react';
import { ThrottledImage } from './ThrottledImage';

interface PolaroidProps {
  src: string;
  alt?: string;
  caption?: string;
  date?: string;
  /** 已废弃：玻璃主题不再旋转卡片，保留仅为兼容旧调用。 */
  rotation?: number;
  className?: string;
  onClick?: () => void;
  aspectRatio?: number;
  fit?: "cover" | "inside";
}

export const Polaroid: React.FC<PolaroidProps> = ({ 
  src, 
  alt = '', 
  caption, 
  date, 
  className = '',
  onClick,
  aspectRatio = 1,
  fit = "cover",
}) => {
  const [hasError, setHasError] = useState(false);

  return (
    <motion.div
      whileHover={{ y: -2, zIndex: 30 }}
      transition={{ duration: 0.16 }}
      className={`polaroid cursor-pointer ${className}`}
      onClick={onClick}
    >
      <div className="relative overflow-hidden rounded-[10px]" style={{ aspectRatio }}>
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
            className={`absolute inset-0 w-full h-full ${fit === "inside" ? "object-contain" : "object-cover"}`}
            onError={() => setHasError(true)}
          />
        )}
      </div>
      {(caption || date) && (
        <div className="mt-3 text-center">
          {caption && <span className="font-headline font-semibold text-base text-on-surface block">{caption}</span>}
          {date && <p className="text-xs text-outline font-label mt-1">{date}</p>}
        </div>
      )}
    </motion.div>
  );
};
