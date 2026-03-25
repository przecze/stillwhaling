import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    strictPort: false,
    cors: true,
    // Allow requests from Docker service names and localhost
    allowedHosts: ['frontend', 'localhost', '127.0.0.1', 'nginx'],
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  },
  publicDir: 'public'
});
