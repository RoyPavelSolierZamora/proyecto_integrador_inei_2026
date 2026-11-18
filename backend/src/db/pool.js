import pg from 'pg';
import { getConfig } from '../config.js';

const { Pool } = pg;
let pool;

export function getPool() {
  if (!pool) {
    const config = getConfig();
    pool = new Pool({
      ...config.database,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: 'epen_dashboard',
      ssl: config.databaseSsl ? { rejectUnauthorized: true } : false,
    });
    pool.on('error', error => console.error('Conexión PostgreSQL inactiva:', error.message));
  }
  return pool;
}

export async function transaction(work) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) await pool.end();
  pool = undefined;
}

