import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: 'frontend',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: '../dist-frontend',
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'frontend/src')
    }
  }
});
