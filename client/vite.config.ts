import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    define: {
      'import.meta.env.VITE_MAP_SERVER_URL': JSON.stringify(
        env.VITE_MAP_SERVER_URL || 'http://localhost:3000'
      ),
    },
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
  };
});
