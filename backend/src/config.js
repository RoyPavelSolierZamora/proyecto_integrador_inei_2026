import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

try { loadEnvFile(resolve(process.cwd(), '.env')); } catch { /* El archivo es opcional. */ }

function integer(name, fallback, min, max) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} debe estar entre ${min} y ${max}.`);
  return value;
}

export function getConfig() {
  const databaseUrl = process.env.DATABASE_URL;
  const database = databaseUrl ? { connectionString: databaseUrl } : {
    host: process.env.PGHOST || '127.0.0.1',
    port: integer('PGPORT', 5432, 1, 65535),
    database: process.env.PGDATABASE || 'epen_codificacion',
    user: process.env.PGUSER || 'epen_app',
    password: process.env.PGPASSWORD,
  };
  if (!databaseUrl && !database.password) throw new Error('Falta la credencial de PostgreSQL en memoria (PGPASSWORD).');
  const nodeEnv = process.env.NODE_ENV || 'development';
  const qwenMode = process.env.QWEN_MODE || 'real';
  if (qwenMode !== 'real') throw new Error('QWEN_MODE debe ser real.');
  const r3Mode = String(process.env.R3_MODE || 'local').trim().toLowerCase();
  if (!['local', 'remote'].includes(r3Mode)) throw new Error('R3_MODE debe ser local o remote.');
  const r3BaseUrl = String(process.env.R3_BASE_URL || 'http://127.0.0.1:8000').trim().replace(/\/$/, '');
  const r3ApiToken = String(process.env.R3_API_TOKEN || '').trim();
  if (r3Mode === 'remote' && !r3BaseUrl.startsWith('https://')) throw new Error('R3 remoto requiere una URL HTTPS.');
  if (r3Mode === 'remote' && r3ApiToken.length < 24) throw new Error('R3 remoto requiere R3_API_TOKEN de al menos 24 caracteres.');
  return {
    nodeEnv,
    production: nodeEnv === 'production',
    database,
    databaseSsl: process.env.DB_SSL === 'require',
    port: integer('BACKEND_PORT', 8080, 1024, 65535),
    appOrigin: process.env.APP_ORIGIN || 'http://127.0.0.1:5174',
    sessionHours: integer('SESSION_HOURS', 8, 1, 24),
    cookieName: 'epen_session',
    qwenMode,
    r3Mode,
    r3BaseUrl,
    r3ApiToken: r3ApiToken || null,
    r2BaseUrl: process.env.R2_BASE_URL || 'http://127.0.0.1:8100',
    r2BatchSize: integer('R2_BATCH_SIZE', 100, 1, 500),
    r2TimeoutSeconds: integer('R2_TIMEOUT_SECONDS', 120, 5, 900),
  };
}

