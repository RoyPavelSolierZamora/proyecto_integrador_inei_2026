import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, getPool } from '../src/db/pool.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');
const client = await getPool().connect();

try {
  await client.query('SELECT pg_advisory_lock(704309)');
  await client.query('CREATE SCHEMA IF NOT EXISTS epen');
  await client.query('CREATE TABLE IF NOT EXISTS epen.schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const applied = new Set((await client.query('SELECT version FROM epen.schema_migrations')).rows.map(row => row.version));
  const files = (await readdir(migrationsDir)).filter(name => name.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    await client.query('BEGIN');
    try {
      await client.query(await readFile(join(migrationsDir, file), 'utf8'));
      await client.query('INSERT INTO epen.schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`Migración aplicada: ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  console.log('Base de datos actualizada.');
} finally {
  await client.query('SELECT pg_advisory_unlock(704309)').catch(() => {});
  client.release();
  await closePool();
}

