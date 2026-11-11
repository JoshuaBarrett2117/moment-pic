import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ToastProvider } from './components/Toast.tsx';
import './index.css';
import { applyTheme, getActiveThemeId } from './theme/theme-runtime';

// theme-init.js 已在首屏前设置 data-theme，这里再同步一次 meta 与 color-scheme
applyTheme(getActiveThemeId());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
