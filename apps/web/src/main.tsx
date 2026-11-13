import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { LazyMotion } from 'motion/react';
import App from './App.tsx';
import { ToastProvider } from './components/Toast.tsx';
import './index.css';
import { applyTheme, getActiveThemeId } from './theme/theme-runtime';

// theme-init.js 已在首屏前设置 data-theme，这里再同步一次 meta 与 color-scheme
applyTheme(getActiveThemeId());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 动画特性异步加载；strict 确保没有组件误用完整的 motion.* */}
    <LazyMotion features={() => import('./motion-features').then((mod) => mod.default)} strict>
      <ToastProvider>
        <App />
      </ToastProvider>
    </LazyMotion>
  </StrictMode>,
);
