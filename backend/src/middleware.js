import { getConfig } from './config.js';
import { getPool } from './db.js';
import { hashToken } from './security.js';

function cookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const index = part.indexOf('=');
    return index < 0 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}

export async function loadSession(req, _res, next) {
  try {
    const config = getConfig();
    const token = cookies(req.headers.cookie)[config.cookieName];
    if (!token) return next();
    const tokenHash = hashToken(token);
    const result = await getPool().query(`
      SELECT s.token_hash, btrim(s.csrf_token) AS csrf_token, s.expires_at,
             u.id, u.username, u.full_name, u.role, u.active
      FROM epen.sessions s
      JOIN epen.users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()
        AND u.active = true AND u.deleted_at IS NULL
    `, [tokenHash]);
    if (result.rowCount) {
      const row = result.rows[0];
      req.auth = {
        tokenHash: row.token_hash,
        csrfToken: row.csrf_token,
        user: { id: row.id, username: row.username, name: row.full_name, role: row.role },
      };
      await getPool().query('UPDATE epen.sessions SET last_seen_at = now() WHERE token_hash = $1', [tokenHash]);
    }
    next();
  } catch (error) { next(error); }
}

export function requireAuth(req, res, next) {
  if (!req.auth) return res.status(401).json({ error: 'Sesión no válida o vencida.' });
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'Sesión no válida o vencida.' });
    if (!roles.includes(req.auth.user.role)) return res.status(403).json({ error: 'No tienes permiso para esta operación.' });
    next();
  };
}

export function requireCsrf(req, res, next) {
  const config = getConfig();
  if (req.headers.origin !== config.appOrigin) return res.status(403).json({ error: 'Origen de la petición no permitido.' });
  // csrf_token es char(64): PostgreSQL rellena con espacios. Comparar sin
  // relleno evita que toda mutación falle tras restaurar la sesión con /me.
  const supplied = String(req.headers['x-csrf-token'] || '').trim();
  const expected = req.auth ? String(req.auth.csrfToken).trim() : '';
  if (!req.auth || !expected || supplied !== expected) return res.status(403).json({ error: 'Token de seguridad inválido.' });
  next();
}

export function requireTrustedOrigin(req, res, next) {
  if (req.headers.origin !== getConfig().appOrigin) return res.status(403).json({ error: 'Origen de la petición no permitido.' });
  next();
}

