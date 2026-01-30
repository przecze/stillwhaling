import { defineConfig } from 'vite';

export default defineConfig({
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
