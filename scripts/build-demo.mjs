// Construye la demostración estática para GitHub Pages en dist-demo/.
//   node scripts/build-demo.mjs
// Variables opcionales: VITE_BASE_PATH (por defecto /proyecto_integrador_inei_2026/).
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entorno = {
  ...process.env,
  VITE_DEMO: 'true',
  // El enrutado por hash evita que GitHub Pages devuelva 404 al recargar una ruta interna.
  VITE_ROUTER_MODE: 'hash',
  VITE_BASE_PATH: process.env.VITE_BASE_PATH || '/proyecto_integrador_inei_2026/',
};

const resultado = spawnSync(
  process.execPath,
  [join(raiz, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', join(raiz, 'dist-demo'), '--emptyOutDir'],
  { cwd: raiz, env: entorno, stdio: 'inherit' },
);
process.exit(resultado.status ?? 1);
