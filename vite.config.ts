import { readFileSync } from 'node:fs';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { injectCspMeta } from './security-headers';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  base: './',
  plugins: [
    svelte(),
    { name: 'csp-meta', apply: 'build', transformIndexHtml: injectCspMeta },
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Caldence',
        short_name: 'Caldence',
        description: 'Plan the recurring meetings of agile roles and export them to your calendar.',
        start_url: './',
        scope: './',
        display: 'standalone',
        lang: 'en',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      // The icons are already matched by globPatterns; listing them again duplicates precache entries.
      includeManifestIcons: false,
      workbox: {
        // manifest.webmanifest is added by the plugin itself.
        globPatterns: ['**/*.{js,css,html,svg,png,json}'],
        // Only for link previews (#136) and the server's error page (#151); the app never shows them.
        globIgnores: ['social-preview.png', '404.html'],
        // No navigateFallback: the app has one page, and precacheAndRoute serves ./ via
        // directoryIndex. A fallback would answer every other page in scope with the app.
        navigateFallback: null,
        // ./?anything still opens the app offline.
        ignoreURLParametersMatching: [/.*/],
      },
    }),
  ],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
