import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Acceso temporal mediante un túnel HTTPS.
 *
 * Vite solo acepta peticiones cuyo cabecera Host sea localhost/127.0.0.1. Para
 * enseñar el dashboard por un túnel (Cloudflare Tunnel, ngrok, ...) hay que
 * autorizar ese dominio explícitamente. Se hace por variable de entorno para no
 * abrir el servidor a cualquier host ni cambiar el comportamiento local:
 *
 *   $env:TUNNEL_HOST = 'algo-random.trycloudflare.com'
 *
 * Sin TUNNEL_HOST el servidor solo admite los hosts locales predeterminados.
 */
function normalizeHost(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return raw.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/:\d+$/, '') || null;
}

const tunnelHost = normalizeHost(process.env.TUNNEL_HOST);

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: {
    port: 5174,
    // Si el 5174 esta ocupado, fallar en vez de saltar a 5175: el tunel siempre
    // apunta al 5174 y un cambio silencioso de puerto rompe el túnel.
    strictPort: true,
    allowedHosts: tunnelHost ? [tunnelHost, '127.0.0.1', 'localhost'] : undefined,
    // El websocket de recarga en caliente no atraviesa bien un túnel HTTPS.
    hmr: tunnelHost ? false : undefined,
    proxy: {
      '/api/auth': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/api/admin': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/api/health': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/api/system': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/api/datasets': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/api/data': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/api/cases': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/api/catalog': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/api/r2': { target: 'http://127.0.0.1:8080', changeOrigin: false },
    },
  },
});
