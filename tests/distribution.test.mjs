import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const requiredFiles = [
  'instalar.bat',
  'instalar.ps1',
  'iniciar-dashboard.bat',
  'iniciar-dashboard.ps1',
  'detener-dashboard.bat',
  'detener-dashboard.ps1',
  'backend/r2_simulator/servicio_r2.py',
  'backend/scripts/seed-synthetic.js',
  'backend/seeds/epen-synthetic-2026.json',
  'r3_local/servicio.py',
  'r3_local/datos/catalogo_ciiu.csv',
];

test('la distribución contiene todos los componentes usados por los lanzadores', async () => {
  await Promise.all(requiredFiles.map(path => access(path)));
  const installer = await readFile('instalar.ps1', 'utf8');
  const launcher = await readFile('iniciar-dashboard.ps1', 'utf8');
  assert.match(installer, /backend\\r2_simulator/);
  assert.match(installer, /backend\/scripts\/seed-synthetic\.js/);
  assert.match(launcher, /backend\\r2_simulator/);
});

test('la semilla incluida está identificada como sintética', async () => {
  const seed = JSON.parse(await readFile('backend/seeds/epen-synthetic-2026.json', 'utf8'));
  assert.match(seed.dataset.code, /SYNTHETIC/);
  assert.match(seed.dataset.notes, /sintéticos/i);
  assert.ok(seed.cases.length > 0);
  assert.ok(seed.cases.every(item => item.id_registro && item.p309 && Array.isArray(item.candidatos)));
});
