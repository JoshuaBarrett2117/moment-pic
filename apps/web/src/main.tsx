import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ToastProvider } from './components/Toast.tsx';
// 字体本地打包，不再依赖 Google Fonts（国内网络与离线部署均可用）
import '@fontsource/epilogue/400.css';
import '@fontsource/epilogue/400-italic.css';
import '@fontsource/epilogue/700.css';
import '@fontsource/epilogue/800.css';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource-variable/caveat/index.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
