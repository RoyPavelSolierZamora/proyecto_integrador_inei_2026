import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api/auth': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/api/admin': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/api/health': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/api/system': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/api/data': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/api/cases': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/api/catalog': { target: 'http://127.0.0.1:8080', changeOrigin: false },
    },
  },
});
