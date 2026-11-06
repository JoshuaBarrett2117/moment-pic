import type { ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'motion/react';

interface WobblyButtonProps extends Omit<HTMLMotionProps<'button'>, 'ref' | 'children'> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'tertiary';
}

export const WobblyButton = ({ 
  children, 
  variant = 'primary', 
  className = '', 
  disabled,
  ...props 
}: WobblyButtonProps) => {
  const variants = {
    primary: 'bg-primary-container text-on-primary-container shadow-lg shadow-[#6f4e37]/10',
    secondary: 'bg-secondary-container text-on-secondary-container',
    tertiary: 'bg-tertiary-container text-on-tertiary-container',
  };

  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.95 }}
      className={`py-4 px-8 rounded-full font-black text-lg transition-all flex items-center justify-center gap-2 ${variants[variant]} ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </motion.button>
  );
};
