/// <reference types="vitest/config" />
import { copyFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { tokenColors } from './scripts/theme-colors.ts'

const APP_NAME = 'Practice tracker'
const paper = tokenColors('paper')

// GitHub Pages answers unknown paths with 404.html. A copy of index.html there
// lets the client-side router handle deep links like /brother-tracker/today.
function spaFallback(): Plugin {
  let outDir = ''
  return {
    name: 'spa-404-fallback',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      copyFileSync(join(outDir, 'index.html'), join(outDir, '404.html'))
    },
  }
}

// The browser's frame colour, per theme, from the paper token.
function themeColor(): Plugin {
  return {
    name: 'theme-color-from-tokens',
    transformIndexHtml: () =>
      (['light', 'dark'] as const).map((scheme) => ({
        tag: 'meta',
        attrs: {
          name: 'theme-color',
          media: `(prefers-color-scheme: ${scheme})`,
          content: paper[scheme],
        },
        injectTo: 'head',
      })),
  }
}

export default defineConfig({
  base: '/brother-tracker/',
  plugins: [
    react(),
    tailwindcss(),
    themeColor(),
    // Installable, and the app shell (code, styles, fonts, icons) works offline. Data
    // never goes through the service worker: the query cache and the outbox own it.
    // A new version waits until the app is next opened; it never reloads a page mid-log.
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'script-defer',
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: APP_NAME,
        short_name: 'Practice',
        description: 'Log practice and follow along.',
        display: 'standalone',
        background_color: paper.light,
        theme_color: paper.light,
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Fonts: only the Latin subsets; the others load online if a page ever needs them.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}', '**/*-latin-*.woff2'],
        cleanupOutdatedCaches: true,
      },
    }),
    spaFallback(),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    rolldownOptions: {
      output: {
        // Libraries change less often than the app, so they get their own long-lived chunks.
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/,
              priority: 3,
            },
            { name: 'supabase', test: /[\\/]node_modules[\\/]@supabase[\\/]/, priority: 2 },
            { name: 'vendor', test: /[\\/]node_modules[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
  },
})
