/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
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
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/files\//, /^\/ws/],
        runtimeCaching: [
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
        manualChunks: {
          react: ['react', 'react-dom', 'react-router'],
          query: ['@tanstack/react-query', 'zustand'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
