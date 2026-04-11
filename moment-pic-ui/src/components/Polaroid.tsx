import React from 'react';
import { motion } from 'motion/react';

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
  return (
    <motion.div
      whileHover={{ scale: 1.05, rotate: 0, zIndex: 30 }}
      initial={{ rotate: rotation }}
      className={`polaroid cursor-pointer transition-transform duration-500 ${className}`}
      onClick={onClick}
    >
      <div className="relative overflow-hidden aspect-square rounded-sm mb-4">
        <img 
          src={src} 
          alt={alt} 
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
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
