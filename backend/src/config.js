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
  const qwenMode = process.env.QWEN_MODE || 'demo';
  if (!['demo', 'real'].includes(qwenMode)) throw new Error('QWEN_MODE debe ser demo o real.');
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
    r3BaseUrl: process.env.R3_BASE_URL || 'http://127.0.0.1:8000',
  };
}

