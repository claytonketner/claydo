import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves project sites from /<repo>/, so the base path must match
// the repository name. Override with VITE_BASE=/ for a custom domain or local use.
const base = process.env.VITE_BASE ?? '/claydo/';

export default defineConfig({
  base,
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Claydo',
        short_name: 'Claydo',
        description: 'A spatial sticky-note TODO board.',
        theme_color: '#f3ecd9',
        background_color: '#f3ecd9',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}']
      }
    })
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  }
});
