import { randomBytes } from 'node:crypto';
import { closePool, getPool } from '../src/db.js';
import { hashPassword, normalizeUsername, validUsername, validatePassword } from '../src/security.js';

/**
 * Crea una cuenta para la demostración pública.
 *
 * Deliberadamente NO acepta los roles supervisor/admin: la idea es que los
 * invitados puedan mirar el dashboard (auditor) o probar la codificación
 * (analista), sin poder importar bases, simular umbrales ni tocar usuarios.
 *
 * La contraseña llega por variable de entorno y nunca se escribe en disco.
 * Si no se proporciona, se genera una y se imprime una sola vez.
 */
const username = normalizeUsername(process.env.DEMO_USERNAME || 'demo');
const fullName = String(process.env.DEMO_FULL_NAME || 'Invitado de demostración').trim();
const role = String(process.env.DEMO_ROLE || 'auditor').trim();
const provided = process.env.DEMO_PASSWORD || '';
const generated = !provided;
const password = provided || `Demo-${randomBytes(9).toString('base64url')}`;

if (!['auditor', 'analista'].includes(role)) {
  console.error('DEMO_ROLE debe ser auditor (solo lectura) o analista (puede codificar).');
  process.exitCode = 1;
} else if (!validUsername(username) || !fullName || validatePassword(password)) {
  console.error('Revisa DEMO_USERNAME y DEMO_FULL_NAME. La clave debe tener al menos 12 caracteres.');
  process.exitCode = 1;
} else {
  const pool = getPool();
  try {
    const existing = await pool.query('SELECT id, role, active FROM epen.users WHERE lower(username) = $1', [username]);
    if (existing.rowCount) {
      const row = existing.rows[0];
      if (!row.active) {
        await pool.query('UPDATE epen.users SET active = true, updated_at = now() WHERE id = $1', [row.id]);
        console.log(`La cuenta ${username} ya existía y estaba desactivada: se reactivó. No se cambió la clave.`);
      } else {
        console.log(`La cuenta ${username} ya existe (rol ${row.role}). No se cambió la clave.`);
      }
    } else {
      const passwordHash = await hashPassword(password);
      await pool.query(
        'INSERT INTO epen.users (username, full_name, password_hash, role) VALUES ($1, $2, $3, $4)',
        [username, fullName, passwordHash, role],
      );
      console.log(`Cuenta demo creada: ${username} (rol ${role})`);
      if (generated) console.log(`Clave temporal: ${password}`);
      else console.log('Clave: la que indicaste en DEMO_PASSWORD.');
    }
  } finally {
    await closePool();
  }
}
