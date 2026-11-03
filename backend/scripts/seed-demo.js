import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, getPool, transaction } from '../src/db.js';

const here = dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(await readFile(join(here, '..', 'seeds', 'epen-demo-2026.json'), 'utf8'));

/**
 * Catalogo CIIU. La copia canonica viaja dentro del repositorio (r3_local); la
 * ruta del workspace original queda solo como respaldo para el equipo de R3.
 */
const catalogCandidates = [
  join(here, '..', 'seeds', 'catalogo_ciiu.csv'),
  resolve(here, '..', '..', 'r3_local', 'datos', 'catalogo_ciiu.csv'),
  resolve(here, '..', '..', '..', 'Codigos', 'pipeline_llm', 'datos', 'catalogo_ciiu.csv'),
];

async function readCatalog() {
  for (const candidate of catalogCandidates) {
    try {
      return await readFile(candidate, 'utf8');
    } catch { /* se prueba la siguiente ubicacion */ }
  }
  throw new Error(
    'No se encontro catalogo_ciiu.csv. Ejecuta instalar.ps1 o coloca el archivo en backend/seeds/.',
  );
}

function parseCatalog(text) {
  return text.replace(/^\uFEFF/, '').split(/\r?\n/).slice(1).filter(Boolean).map(line => {
    const comma = line.indexOf(',');
    let description = line.slice(comma + 1).trim();
    if (description.startsWith('"') && description.endsWith('"')) description = description.slice(1, -1).replace(/""/g, '"');
    return { code: line.slice(0, comma).trim(), description };
  });
}

try {
  // --si-vacio protege una instalacion que ya tiene bases: nunca archiva ni
  // reactiva datasets existentes. Es el modo que usa instalar.ps1.
  const onlyIfEmpty = process.argv.includes('--si-vacio');
  let skip = false;
  if (onlyIfEmpty) {
    const { rows } = await getPool().query('SELECT count(*)::int AS total FROM epen.datasets');
    skip = rows[0].total > 0;
    if (skip) {
      console.log('La base ya contiene datasets: se conserva la informacion y se omite la semilla inicial.');
    }
  }

  if (!skip) {
    const catalog = parseCatalog(await readCatalog());
    await transaction(async client => {
    await client.query(`
      INSERT INTO epen.ciiu_catalog (code, description)
      SELECT code, description FROM unnest($1::text[], $2::text[]) AS rows(code, description)
      ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, active = true, updated_at = now()
    `, [catalog.map(item => item.code), catalog.map(item => item.description)]);

    const existing = await client.query('SELECT id FROM epen.datasets WHERE code = $1 FOR UPDATE', [seed.dataset.code]);
    let datasetId;
    if (existing.rowCount) {
      datasetId = existing.rows[0].id;
      await client.query("UPDATE epen.datasets SET status = 'active', is_synthetic = true, notes = $2, activated_at = now() WHERE id = $1", [datasetId, seed.dataset.notes]);
    } else {
      await client.query("UPDATE epen.datasets SET status = 'archived' WHERE status = 'active'");
      const created = await client.query(`
        INSERT INTO epen.datasets (code, name, period, version, source_filename, status, is_synthetic, notes, activated_at)
        VALUES ($1, $2, $3, $4, $5, 'active', true, $6, now()) RETURNING id
      `, [seed.dataset.code, seed.dataset.name, seed.dataset.period, seed.dataset.version, seed.dataset.source_filename, seed.dataset.notes]);
      datasetId = created.rows[0].id;
    }

    for (const item of seed.cases) {
      const inserted = await client.query(`
        INSERT INTO epen.survey_cases
          (dataset_id, external_id, p309, p308, p308a, candidates, confianza_ml, status, final_code, demo_qwen)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10::jsonb)
        ON CONFLICT (dataset_id, external_id) DO NOTHING
        RETURNING id
      `, [datasetId, item.id_registro, item.p309, item.p308, item.p308a, JSON.stringify(item.candidatos), item.confianza_ml, item.estado, item.codigo_final || null, JSON.stringify(item.demo_qwen)]);
      if (!inserted.rowCount) continue;
      const caseId = inserted.rows[0].id;
      if (item.estado === 'review') {
        await client.query("INSERT INTO epen.decisions (case_id, source, decision, justification) VALUES ($1, 'human', 'derivation', 'Caso sintético derivado para prueba')", [caseId]);
      } else if (item.estado === 'resolved') {
        const decision = item.id_registro === 'EPEN-000608' ? 'correction' : 'confirmation';
        await client.query("INSERT INTO epen.decisions (case_id, source, decision, code, justification) VALUES ($1, 'human', $2, $3, 'Decisión sintética inicial')", [caseId, decision, item.codigo_final]);
      }
    }
      await client.query('UPDATE epen.datasets SET record_count = (SELECT count(*) FROM epen.survey_cases WHERE dataset_id = $1) WHERE id = $1', [datasetId]);
    });
    console.log(`Datos sinteticos instalados en PostgreSQL: ${seed.cases.length} casos y catalogo CIIU.`);
  }
} finally {
  await closePool();
}

