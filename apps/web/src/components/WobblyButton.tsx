import type { ReactNode } from 'react';
import { m, type HTMLMotionProps } from 'motion/react';

interface WobblyButtonProps extends Omit<HTMLMotionProps<'button'>, 'ref' | 'children'> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'tertiary';
}

/**
 * 主题化按钮（历史名称 WobblyButton，保留导出以兼容旧引用；新代码使用 Button）。
 * primary：强调色实底；secondary/tertiary：玻璃底。
 */
export const WobblyButton = ({
  children,
  variant = 'primary',
  className = '',
  disabled,
  ...props
}: WobblyButtonProps) => {
  const variants = {
    primary: 'bg-primary text-on-primary shadow-[0_8px_24px_-8px_var(--mp-accent)] hover:brightness-110',
    secondary: 'border border-outline-variant bg-surface-container-high text-on-surface hover:bg-surface-container-highest',
    tertiary: 'border border-outline-variant bg-surface-container text-on-surface-variant hover:text-on-surface',
  };

  return (
    <m.button
      whileHover={{ y: disabled ? 0 : -1 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      transition={{ duration: 0.16 }}
      className={`flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-base font-semibold transition-all ${variants[variant]} ${className} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </m.button>
  );
};

export const Button = WobblyButton;
