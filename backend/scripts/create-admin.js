import { closePool, getPool } from '../src/db/pool.js';
import { hashPassword, normalizeUsername, validUsername, validatePassword } from '../src/security/security.js';

const username = normalizeUsername(process.env.ADMIN_USERNAME);
const fullName = String(process.env.ADMIN_FULL_NAME || '').trim();
const password = process.env.ADMIN_PASSWORD || '';

if (!validUsername(username) || !fullName || validatePassword(password)) {
  console.error('Define ADMIN_USERNAME, ADMIN_FULL_NAME y ADMIN_PASSWORD (mínimo 12 caracteres) solo para esta ejecución.');
  process.exitCode = 1;
} else {
  const pool = getPool();
  const existing = await pool.query('SELECT id FROM epen.users WHERE lower(username) = $1', [username]);
  if (existing.rowCount) {
    console.error('Ese nombre de usuario ya existe. No se modificó su clave.');
    process.exitCode = 1;
  } else {
    const passwordHash = await hashPassword(password);
    await pool.query(`INSERT INTO epen.users (username, full_name, password_hash, role) VALUES ($1, $2, $3, 'admin')`, [username, fullName, passwordHash]);
    console.log(`Administrador creado: ${username}`);
  }
  await closePool();
}

