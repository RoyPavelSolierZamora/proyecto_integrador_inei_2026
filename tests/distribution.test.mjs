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
  'conectar-colab.bat',
  'conectar-colab.ps1',
  'usar-ia-local.bat',
  'usar-ia-local.ps1',
  'backend/r2_simulator/servicio_r2.py',
  'backend/r2_advanced/servicio_r2.py',
  'backend/r2_advanced/requirements.txt',
  'backend/migrations/006_job_control.sql',
  'backend/migrations/007_multivariate_fields.sql',
  'backend/migrations/008_expand_multivariate_fields.sql',
  'colab/R3_Qwen_EPEN_GPU.ipynb',
  'colab/r3_gpu_service.py',
  'colab/R2_BETO_EPEN_Evaluacion_Temporal.ipynb',
  'colab/r2_beto_temporal.py',
  'backend/scripts/seed-synthetic.js',
  'backend/seeds/epen-synthetic-2026.json',
  'r3_local/servicio.py',
  'r3_local/datos/catalogo_ciiu.csv',
];

test('la distribución contiene todos los componentes usados por los lanzadores', async () => {
  await Promise.all(requiredFiles.map(path => access(path)));
  const installer = await readFile('instalar.ps1', 'utf8');
  const launcher = await readFile('iniciar-dashboard.ps1', 'utf8');
  const localR3 = await readFile('r3_local/servicio.py', 'utf8');
  const colabR3 = await readFile('colab/r3_gpu_service.py', 'utf8');
  assert.match(installer, /backend\\r2_simulator/);
  assert.match(installer, /backend\/scripts\/seed-synthetic\.js/);
  assert.match(launcher, /backend\\r2_simulator/);
  assert.match(localR3, /prompt_v5_contexto_historico\.txt/);
  assert.match(colabR3, /prompt-colab-v2-contexto-historico/);
});

test('la semilla incluida está identificada como sintética', async () => {
  const seed = JSON.parse(await readFile('backend/seeds/epen-synthetic-2026.json', 'utf8'));
  assert.match(seed.dataset.code, /SYNTHETIC/);
  assert.match(seed.dataset.notes, /sintéticos/i);
  assert.ok(seed.cases.length > 0);
  assert.ok(seed.cases.every(item => item.id_registro && item.p309 && Array.isArray(item.candidatos)));
});
