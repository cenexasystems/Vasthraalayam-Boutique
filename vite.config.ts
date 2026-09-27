import 'dotenv/config'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { neonApiDevPlugin } from './scripts/dev-api-plugin'

export default defineConfig({
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  plugins: [
    neonApiDevPlugin(),
    react(),
    VitePWA({
      selfDestroying: true,
      includeAssets: [
        'chaji-logo.jpeg',
        'chaji-logo.png',
        'chaji-icon.png',
        'chaji-icon-192.png',
        'chaji-icon-512.png',
        'chaji-icon-maskable-192.png',
        'chaji-icon-maskable-512.png',
        'apple-touch-icon.png',
        'chaji-favicon.png',
        'robots.txt',
      ],
      manifest: {
        name: 'VASTHRAALAYAM BOUTIQUE Retail POS',
        short_name: 'VASTHRAALAYAM',
        description: 'VASTHRAALAYAM BOUTIQUE retail billing, barcode inventory, catalog, order, receipt, and invoice administration.',
        theme_color: '#2c392a',
        background_color: '#2c392a',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/chaji-icon-192.png?v=4',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/chaji-icon-512.png?v=4',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/chaji-icon-maskable-192.png?v=4',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/chaji-icon-maskable-512.png?v=4',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpeg,jpg,woff,woff2}'],
        navigateFallbackDenylist: [/^\/api/, /^\/admin/, /supabase/, /^\/assets\//, /\.[a-zA-Z0-9]+$/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (!id.includes('node_modules')) return
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('framer-motion')) return 'motion'
          if (id.includes('recharts') || id.includes('d3-') || id.includes('react-smooth') || id.includes('victory-')) return 'charts'
          if (id.includes('react-router')) return 'router'
          if (id.includes('lucide-react')) return 'icons'
          if (id.includes('jsbarcode') || id.includes('@zxing')) return 'barcode'
          if (id.includes('workbox') || id.includes('vite-plugin-pwa')) return 'pwa'
          return 'vendor'
        },
      },
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
  },
  server: {
    allowedHosts: true,
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
    },
  },
})
