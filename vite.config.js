import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import electron from 'vite-plugin-electron/simple';
import path from 'node:path';

export default defineConfig({
  plugins: [
    vue(),
    electron({
      main: {
        entry: 'electron/main.js',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              input: {
                main: path.join(__dirname, 'electron/main.js'),
                customSource: path.join(__dirname, 'electron/customSource.js')
              },
              external: ['electron', 'music-metadata'],
              output: {
                entryFileNames: '[name].js'
              }
            }
          }
        }
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.js'),
        vite: {
          build: {
            outDir: 'dist-electron'
          }
        }
      },
      renderer: {}
    })
  ],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
