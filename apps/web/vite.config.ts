import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

const withUtf8Charset = (contentType: string): string => {
  if (/;\s*charset=/i.test(contentType)) {
    return contentType;
  }

  const normalized = contentType.toLowerCase();
  const shouldAttach =
    normalized.startsWith('text/') ||
    normalized.startsWith('application/javascript') ||
    normalized.startsWith('text/javascript') ||
    normalized.startsWith('application/json') ||
    normalized.startsWith('application/xml') ||
    normalized.startsWith('image/svg+xml');

  return shouldAttach ? `${contentType}; charset=utf-8` : contentType;
};

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'dev-utf8-charset',
        configureServer(server) {
          server.middlewares.use((_req, res, next) => {
            const originalSetHeader = res.setHeader.bind(res);
            res.setHeader = ((name: string, value: number | string | readonly string[]) => {
              if (
                name.toLowerCase() === 'content-type' &&
                typeof value === 'string'
              ) {
                return originalSetHeader(name, withUtf8Charset(value));
              }
              return originalSetHeader(name, value);
            }) as typeof res.setHeader;
            next();
          });
        },
      },
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3210,
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: 'http://localhost:3211',
          changeOrigin: true,
        },
        '/ws': {
          target: 'ws://localhost:3211',
          ws: true,
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return;
            }

            if (id.includes('react') || id.includes('scheduler')) {
              return 'vendor-react';
            }

            if (id.includes('photoswipe')) {
              return 'vendor-photoswipe';
            }

            if (id.includes('motion')) {
              return 'vendor-motion';
            }

            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }

            return 'vendor-misc';
          },
        },
      },
    },
  };
});
