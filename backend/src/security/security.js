import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LENGTH = 64;

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 12) return 'La clave debe tener al menos 12 caracteres.';
  if (password.length > 128) return 'La clave no puede superar 128 caracteres.';
  return null;
}

export async function hashPassword(password) {
  const error = validatePassword(password);
  if (error) throw new Error(error);
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`;
}

export async function verifyPassword(password, encoded) {
  try {
    const [algorithm, n, r, p, saltValue, hashValue] = encoded.split('$');
    if (algorithm !== 'scrypt') return false;
    const expected = Buffer.from(hashValue, 'base64url');
    const actual = Buffer.from(await scrypt(password, Buffer.from(saltValue, 'base64url'), expected.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
    }));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function createCsrfToken() {
  return randomBytes(32).toString('hex');
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

export function validUsername(value) {
  return /^[a-z0-9._-]{3,30}$/.test(value);
}

