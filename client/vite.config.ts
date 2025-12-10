import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      '$lib/navigation': path.resolve(__dirname, './src/lib/navigation/index.ts'),
      '$lib/navigation/*': path.resolve(__dirname, './src/lib/navigation/*'),
      '$lib/utils': path.resolve(__dirname, './src/lib/utils/index.ts'),
      '$lib/utils/*': path.resolve(__dirname, './src/lib/utils/*'),
      $lib: path.resolve(__dirname, './src/lib'),
      '$lib/*': path.resolve(__dirname, './src/lib/*'),
    },
  },
});
