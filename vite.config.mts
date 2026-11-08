import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, mergeConfig } from 'vite';
import { angularConfig } from '@nativescript/vite/angular';
import { protect, restore } from './postcss-masonkit.mjs';
import { masonkitSingleInstance } from './masonkit-hmr.mjs';
import { nativescriptCanvas } from './canvas-workarounds.mjs';
import { escapedSelectorCommas } from './postcss-selector-commas.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  // Only these values reach the bundle; no client secret is needed (PKCE).
  const env = loadEnv(mode, root, 'SPOTIFY_');

  return mergeConfig(angularConfig({ mode }), {
    define: {
      __SPOTIFY_CLIENT_ID__: JSON.stringify(env.SPOTIFY_CLIENT_ID ?? ''),
      __SPOTIFY_REDIRECT_URI__: JSON.stringify(env.SPOTIFY_CLIENT_CALLBACK_URL ?? ''),
      // Linux signs in through the system browser with a loopback redirect.
      __SPOTIFY_LOOPBACK_REDIRECT_URI__: JSON.stringify(
        env.SPOTIFY_LOOPBACK_CALLBACK_URL || 'http://127.0.0.1:8898/callback',
      ),
    },
    plugins: [masonkitSingleInstance(), ...nativescriptCanvas()],
    optimizeDeps: {
      // MasonKit must load as a single instance over the HMR server. If Vite
      // pre-bundles a subpath (e.g. `/angular`), that copy is routed to the
      // vendor bundle, where MasonKit is deliberately absent, and its exports
      // come back undefined ("installMasonKit is not a function").
      exclude: [
        '@triniwiz/nativescript-masonkit',
        '@triniwiz/nativescript-masonkit/angular',
        '@triniwiz/nativescript-masonkit/web',
        '@triniwiz/nativescript-masonkit/elements',
      ],
    },
    css: {
      postcss: {
        // Lets Tailwind layout utilities (flex, grid, gap, max-w, ...) reach
        // MasonKit views instead of being stripped for core layouts, and keeps
        // classes with commas in them, like `grid-cols-[repeat(...,...)]`.
        plugins: [protect(), restore(), escapedSelectorCommas()],
      },
    },
  });
});
