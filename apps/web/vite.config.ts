import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

const api = process.env.VITE_DEV_API ?? 'http://localhost:8787';
const realtime = process.env.VITE_DEV_REALTIME ?? 'ws://localhost:8788';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['brand/*', 'favicon.png', 'favicon-48.png', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Qubedu',
        short_name: 'Qubedu',
        description: 'تعلّم، أنشئ، وتواصل في مكان واحد.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        background_color: '#10172b',
        theme_color: '#6c5ce7',
        orientation: 'any',
        dir: 'rtl',
        lang: 'ar',
        categories: ['education', 'productivity', 'social'],
        icons: [
          { src: '/brand/qubedu-app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'الأسئلة', short_name: 'الأسئلة', url: '/quiz' },
          { name: 'Qubedu AI', short_name: 'Qubedu AI', url: '/assistant' },
          { name: 'المخطط', short_name: 'المخطط', url: '/organizer?tab=tasks' },
          { name: 'دراستي', short_name: 'دراستي', url: '/academic' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        // Heavy office-format exporters load on demand; they are cached at runtime instead of precached.
        globIgnores: ['**/exceljs*.js', '**/pptxgen*.js', '**/*.map'],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/files\//, /^\/ws/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/assets\/(exceljs|pptxgen).*\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'qubedu-exporters', expiration: { maxEntries: 4, maxAgeSeconds: 30 * 24 * 3600 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/files/public/'),
            handler: 'CacheFirst',
            options: { cacheName: 'qubedu-media', expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 3600 } },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: api, changeOrigin: false },
      '/files': { target: api, changeOrigin: false },
      '/ws': { target: realtime, ws: true },
    },
  },
  preview: {
    proxy: {
      '/api': { target: api },
      '/files': { target: api },
      '/ws': { target: realtime, ws: true },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|react-router|scheduler)\//.test(id)) return 'react';
          if (/node_modules\/(@tanstack|zustand)\//.test(id)) return 'query';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
