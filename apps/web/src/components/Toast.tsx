import React, { type FC, useEffect, useState, useCallback, createContext, useContext } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  /** 弹出一条提示消息 */
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** 获取全局 Toast 上下文 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}

let nextId = 0;

/**
 * 全局 Toast 提供器，需挂载在 App 根节点
 * 负责管理 Toast 的出栈入栈以及自动消失逻辑
 */
export const ToastProvider: FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++nextId;
    setItems((prev) => [...prev, { id, type, message }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-6 right-6 z-[99999] flex flex-col gap-3 pointer-events-none max-w-[380px]">
        <AnimatePresence>
          {items.map((item) => (
            <ToastCard key={item.id} item={item} onDismiss={dismiss} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

const iconMap: Record<ToastType, FC<{ className?: string }>> = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

const styleMap: Record<ToastType, string> = {
  success: 'bg-[#d4e8cf] text-[#1e3a1a] border-[#a3c89e]',
  error: 'bg-[#ffdad6] text-[#93000a] border-[#f5b0ab]',
  info: 'bg-[#edc3b9] text-[#6e4f47] border-[#d4a89c]',
};

/**
 * 单个 Toast 卡片，带自动消失倒计时
 */
const ToastCard: FC<{ item: ToastItem; onDismiss: (id: number) => void }> = ({
  item,
  onDismiss,
}) => {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(item.id), 3500);
    return () => clearTimeout(timer);
  }, [item.id, onDismiss]);

  const Icon = iconMap[item.type];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 80, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className={`pointer-events-auto flex items-center gap-3 px-5 py-3.5 rounded-2xl border shadow-lg backdrop-blur-sm ${styleMap[item.type]}`}
    >
      <Icon className="w-5 h-5 shrink-0" />
      <span className="text-sm font-medium flex-1 leading-snug">{item.message}</span>
      <button
        onClick={() => onDismiss(item.id)}
        className="shrink-0 p-1 rounded-full hover:bg-black/10 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
};
