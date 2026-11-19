import { randomUUID } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import { audit } from './services/audit.js';
import { getConfig } from './config.js';
import { closePool, getPool, transaction } from './db/pool.js';
import { loadSession, requireAuth, requireCsrf, requireRole, requireTrustedOrigin } from './security/middleware.js';
import { createCsrfToken, createSessionToken, hashPassword, hashToken, normalizeUsername, validUsername, validatePassword, verifyPassword } from './security/security.js';
import { createDataRouter } from './routes/data-routes.js';
import { createGovernanceRouter } from './routes/governance-routes.js';
import { createReferenceRouter } from './routes/reference-routes.js';
import { createInsightsRouter } from './routes/insights-routes.js';
import { createCalidadCodificacionRouter } from './routes/calidad-codificacion-routes.js';
import { resumeR2Jobs } from './services/r2-jobs.js';

const config = getConfig();
const app = express();
const loginAttempts = new Map();

app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '6mb', strict: true }));
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(loadSession);

function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.production,
    sameSite: 'strict',
    path: '/',
    maxAge: config.sessionHours * 60 * 60 * 1000,
  };
}

function publicUser(row) {
  return {
    id: Number(row.id),
    username: row.username,
    name: row.full_name,
    role: row.role,
    active: row.active,
    createdAt: row.created_at,
    analystCode: row.analyst_code || null,
  };
}

function error(status, message) {
  const value = new Error(message);
  value.status = status;
  return value;
}

function loginRateLimit(req, res, next) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    return next();
  }
  entry.count += 1;
  if (entry.count > 10) {
    res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
    return res.status(429).json({ error: 'Demasiados intentos. Vuelve a intentarlo más tarde.' });
  }
  next();
}

async function failedLogin(req, username, reason) {
  await getPool().query(`
    INSERT INTO epen.audit_log (username, action, entity_type, entity_id, details, ip)
    VALUES ($1, 'auth.login_failed', 'user', $1, $2::jsonb, $3)
  `, [username || null, JSON.stringify({ reason }), req.ip || null]);
}

async function lockTargetAndCheckAdmin(client, targetId, actorId) {
  const targetResult = await client.query('SELECT * FROM epen.users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [targetId]);
  if (!targetResult.rowCount) throw error(404, 'Usuario no encontrado.');
  const target = targetResult.rows[0];
  if (Number(target.id) === Number(actorId)) throw error(409, 'No puedes modificar tu propia credencial desde esta operación.');
  if (target.role === 'admin' && target.active) {
    const admins = await client.query("SELECT id, active FROM epen.users WHERE role = 'admin' AND deleted_at IS NULL FOR UPDATE");
    if (admins.rows.filter(item => item.active).length <= 1) throw error(409, 'Debe quedar al menos un administrador activo.');
  }
  return target;
}

app.get('/api/health', async (_req, res) => {
  await getPool().query('SELECT 1');
  res.json({ status: 'ok', database: 'postgresql', time: new Date().toISOString() });
});

app.post('/api/auth/login', requireTrustedOrigin, loginRateLimit, async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password = String(req.body?.password || '');
  if (!validUsername(username) || !password) return res.status(401).json({ error: 'Usuario o clave incorrectos.' });
  const result = await getPool().query('SELECT * FROM epen.users WHERE lower(username) = $1 AND deleted_at IS NULL', [username]);
  const account = result.rows[0];
  if (!account || !account.active) {
    await failedLogin(req, username, account ? 'inactive' : 'unknown');
    return res.status(401).json({ error: 'Usuario o clave incorrectos.' });
  }
  if (account.locked_until && new Date(account.locked_until) > new Date()) {
    await failedLogin(req, username, 'locked');
    return res.status(423).json({ error: 'Cuenta bloqueada temporalmente por seguridad.' });
  }
  if (!(await verifyPassword(password, account.password_hash))) {
    await getPool().query(`
      UPDATE epen.users SET failed_attempts = failed_attempts + 1,
        locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END,
        updated_at = now()
      WHERE id = $1
    `, [account.id]);
    await failedLogin(req, username, 'invalid_password');
    return res.status(401).json({ error: 'Usuario o clave incorrectos.' });
  }

  const sessionToken = createSessionToken();
  const csrfToken = createCsrfToken();
  const tokenHash = hashToken(sessionToken);
  await transaction(async client => {
    await client.query('DELETE FROM epen.sessions WHERE expires_at <= now()');
    await client.query('UPDATE epen.users SET failed_attempts = 0, locked_until = NULL, updated_at = now() WHERE id = $1', [account.id]);
    await client.query(`
      INSERT INTO epen.sessions (token_hash, user_id, csrf_token, expires_at, ip, user_agent)
      VALUES ($1, $2, $3, now() + ($4 || ' hours')::interval, $5, $6)
    `, [tokenHash, account.id, csrfToken, String(config.sessionHours), req.ip || null, String(req.headers['user-agent'] || '').slice(0, 500)]);
    req.auth = { tokenHash, csrfToken, user: publicUser(account) };
    await audit(client, req, 'auth.login', 'user', account.id);
  });
  loginAttempts.delete(req.ip || 'unknown');
  res.cookie(config.cookieName, sessionToken, cookieOptions());
  res.json({ user: publicUser(account), csrfToken });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.auth.user, csrfToken: req.auth.csrfToken });
});

app.post('/api/auth/logout', requireAuth, requireCsrf, async (req, res) => {
  await transaction(async client => {
    await client.query('DELETE FROM epen.sessions WHERE token_hash = $1', [req.auth.tokenHash]);
    await audit(client, req, 'auth.logout', 'user', req.auth.user.id);
  });
  res.clearCookie(config.cookieName, { ...cookieOptions(), maxAge: undefined });
  res.status(204).end();
});

app.get('/api/admin/users', requireRole('admin'), async (_req, res) => {
  const result = await getPool().query(`
    SELECT id, username, full_name, role, active, created_at, analyst_code
    FROM epen.users WHERE deleted_at IS NULL ORDER BY full_name, username
  `);
  res.json({ users: result.rows.map(publicUser) });
});

app.post('/api/admin/users', requireRole('admin'), requireCsrf, async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const fullName = String(req.body?.name || '').trim();
  const role = String(req.body?.role || '');
  const password = String(req.body?.password || '');
  if (!validUsername(username)) throw error(400, 'El nombre de usuario no es válido.');
  if (!fullName || fullName.length > 120) throw error(400, 'El nombre completo es obligatorio y no debe superar 120 caracteres.');
  if (!['operador', 'analista', 'supervisor', 'auditor', 'admin'].includes(role)) throw error(400, 'El rol no es válido.');
  const passwordError = validatePassword(password, username);
  if (passwordError) throw error(400, passwordError);
  const passwordHash = await hashPassword(password);
  try {
    const created = await transaction(async client => {
      const result = await client.query(`
        INSERT INTO epen.users (username, full_name, password_hash, role, created_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, username, full_name, role, active, created_at, analyst_code
      `, [username, fullName, passwordHash, role, req.auth.user.id]);
      await audit(client, req, 'admin.user_created', 'user', result.rows[0].id, { username, role });
      return result.rows[0];
    });
    res.status(201).json({ user: publicUser(created) });
  } catch (cause) {
    if (cause.code === '23505') throw error(409, 'Ese nombre de usuario ya existe.');
    throw cause;
  }
});

app.patch('/api/admin/users/:id/status', requireRole('admin'), requireCsrf, async (req, res) => {
  if (typeof req.body?.active !== 'boolean') throw error(400, 'El estado active debe ser verdadero o falso.');
  const updated = await transaction(async client => {
    const target = await lockTargetAndCheckAdmin(client, req.params.id, req.auth.user.id);
    const result = await client.query('UPDATE epen.users SET active = $1, updated_at = now() WHERE id = $2 RETURNING id, username, full_name, role, active, created_at, analyst_code', [req.body.active, target.id]);
    if (!req.body.active) await client.query('DELETE FROM epen.sessions WHERE user_id = $1', [target.id]);
    await audit(client, req, req.body.active ? 'admin.user_activated' : 'admin.user_deactivated', 'user', target.id, { username: target.username });
    return result.rows[0];
  });
  res.json({ user: publicUser(updated) });
});

// Cambio de clave por un administrador. Si la cuenta es la propia, exige la clave actual.
// La nueva clave nunca se registra ni se devuelve; se guarda solo su hash scrypt.
app.patch('/api/admin/users/:id/password', requireRole('admin'), requireCsrf, async (req, res) => {
  const password = String(req.body?.password || '');
  const currentPassword = String(req.body?.currentPassword || '');
  if (!/^\d{1,10}$/.test(String(req.params.id))) throw error(400, 'El usuario solicitado no es válido.');
  // Todo ocurre en una sola transacción con la fila bloqueada: la comprobación de la clave actual,
  // la validación de la nueva y el cambio no pueden intercalarse con otra escritura de la misma cuenta.
  await transaction(async client => {
    const found = await client.query('SELECT id, username, password_hash FROM epen.users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [req.params.id]);
    if (!found.rowCount) throw error(404, 'Usuario no encontrado.');
    const target = found.rows[0];
    const isSelf = Number(target.id) === Number(req.auth.user.id);
    if (isSelf && !(await verifyPassword(currentPassword, target.password_hash))) {
      throw error(403, 'Para cambiar tu propia clave escribe la clave actual correctamente.');
    }
    const passwordError = validatePassword(password, target.username);
    if (passwordError) throw error(400, passwordError);
    if (isSelf && password === currentPassword) throw error(400, 'La clave nueva debe ser distinta de la actual.');
    const passwordHash = await hashPassword(password);
    await client.query('UPDATE epen.users SET password_hash = $1, failed_attempts = 0, locked_until = NULL, updated_at = now() WHERE id = $2', [passwordHash, target.id]);
    // Cierra todas las sesiones de esa cuenta: quien conocía la clave anterior debe volver a entrar.
    await client.query('DELETE FROM epen.sessions WHERE user_id = $1', [target.id]);
    await audit(client, req, 'admin.password_changed', 'user', target.id, { username: target.username, self: isSelf });
  });
  res.status(204).end();
});

app.delete('/api/admin/users/:id', requireRole('admin'), requireCsrf, async (req, res) => {
  await transaction(async client => {
    const target = await lockTargetAndCheckAdmin(client, req.params.id, req.auth.user.id);
    await client.query('UPDATE epen.users SET active = false, deleted_at = now(), updated_at = now() WHERE id = $1', [target.id]);
    await client.query('DELETE FROM epen.sessions WHERE user_id = $1', [target.id]);
    await audit(client, req, 'admin.user_retired', 'user', target.id, { username: target.username, role: target.role });
  });
  res.status(204).end();
});

app.use(createDataRouter(config));
app.use(createGovernanceRouter());
app.use(createReferenceRouter());
app.use(createInsightsRouter());
app.use(createCalidadCodificacionRouter());

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
app.use((err, req, res, _next) => {
  console.error(`[${req.requestId || 'sin-id'}]`, err.message);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Error interno del servidor.', requestId: req.requestId });
});

const server = app.listen(config.port, '127.0.0.1', async () => {
  try {
    await getPool().query('SELECT 1');
    console.log(`Backend EPEN listo en http://127.0.0.1:${config.port}`);
    const resumed = await resumeR2Jobs(config);
    if (resumed) console.log(`Cola R2 reanudada: ${resumed} trabajo(s).`);
  } catch (error) {
    console.error('No se pudo conectar con PostgreSQL:', error.message);
    server.close();
  }
});

async function shutdown() {
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

