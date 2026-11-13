import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import {defineConfig} from 'vite';

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

const COMPRESSIBLE = /\.(js|mjs|css|html|svg|json|txt|webmanifest)$/i;

// 构建后为文本资源生成 .br / .gz，服务端 @fastify/static 的 preCompressed 直接发送，不在请求时压缩。
const precompress = () => ({
  name: 'moment-pic-precompress',
  apply: 'build' as const,
  writeBundle(options: { dir?: string }) {
    const outDir = options.dir ?? path.resolve(__dirname, 'dist');
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(full) : [full];
      });
    for (const file of walk(outDir)) {
      if (!COMPRESSIBLE.test(file)) continue;
      const source = fs.readFileSync(file);
      if (source.length < 1024) continue;
      fs.writeFileSync(`${file}.gz`, zlib.gzipSync(source, { level: 9 }));
      fs.writeFileSync(
        `${file}.br`,
        zlib.brotliCompressSync(source, {
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
            [zlib.constants.BROTLI_PARAM_SIZE_HINT]: source.length,
          },
        }),
      );
    }
  },
});

// 开发模式：Vite 在 3210，服务端在 3211（见 .env.example 的 PORT）。可用 VITE_API_TARGET 覆盖。
const apiTarget = process.env.VITE_API_TARGET ?? 'http://localhost:3211';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      precompress(),
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
          target: apiTarget,
          changeOrigin: true,
        },
        '/ws': {
          target: apiTarget.replace(/^http/, 'ws'),
          ws: true,
          changeOrigin: true,
        },
      },
    },
  };
});
