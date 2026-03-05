import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'src/client',
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
    fs: {
      // node_modules is symlinked from /tmp for Docker performance.
      // Allow Vite to serve font files (and other assets) from there.
      allow: ['/workspaces/collab-editor', '/tmp/collab-editor-deps'],
    },
  },
});
