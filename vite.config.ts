import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const POS_API_DEFAULT_BASE_URL = 'https://cafeore-pos-git-czojooivca-an.a.run.app';

export default defineConfig(() => {
  return {
    base: process.env.VITE_BASE_PATH || '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        '@cafeore/common': path.resolve(__dirname, 'src/current-caos/common/index.ts'),
      },
    },
    server: {
      // 開発中は cafeore-pos の API へ同じ origin から中継する。API は FRONTEND_ORIGINS に無い
      // origin を WebSocket でも 403 で弾くので、中継時に Origin を外して localhost からつなげるようにする。
      proxy: {
        '/cafeore-pos-api': {
          target: process.env.VITE_CAFEORE_API_BASE_URL || POS_API_DEFAULT_BASE_URL,
          changeOrigin: true,
          ws: true,
          rewrite: (requestPath) => requestPath.replace(/^\/cafeore-pos-api/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
            proxy.on('proxyReqWs', (proxyReq) => proxyReq.removeHeader('origin'));
          },
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
