import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LENGTH = 64;

// Palabras que nadie debe usar como clave, ni completas ni dentro de otra.
const COMMON_WORDS = ['password', 'contrasena', 'contraseña', 'qwerty', 'letmein', 'welcome', '123456', '12345678'];

function hasSequence(value) {
  for (let index = 0; index + 3 < value.length; index += 1) {
    const codes = [0, 1, 2, 3].map(offset => value.charCodeAt(index + offset));
    const step = codes[1] - codes[0];
    if ((step === 1 || step === -1) && codes.every((code, offset) => offset === 0 || code - codes[offset - 1] === step)) {
      const alphanumeric = codes.every(code => /[a-z0-9]/i.test(String.fromCharCode(code)));
      if (alphanumeric) return true;
    }
  }
  return false;
}

// Reglas de la clave. Se usan en el backend como fuente de verdad; el frontend muestra las mismas.
export function passwordPolicyErrors(password, username = '') {
  const value = typeof password === 'string' ? password : '';
  const lower = value.toLowerCase();
  const errors = [];
  if (value.length < 12) errors.push('tener al menos 12 caracteres');
  if (value.length > 64) errors.push('no superar 64 caracteres');
  if (!/[a-z]/.test(value)) errors.push('incluir una letra minúscula');
  if (!/[A-Z]/.test(value)) errors.push('incluir una letra mayúscula');
  if (!/\d/.test(value)) errors.push('incluir un número');
  if (!/[^A-Za-z0-9\s]/.test(value)) errors.push('incluir un símbolo, por ejemplo ! ? # @');
  if (/(.)\1\1/.test(value)) errors.push('no repetir un mismo carácter tres veces seguidas');
  if (hasSequence(value)) errors.push('no usar secuencias como 1234 o abcd');
  const name = String(username || '').trim().toLowerCase();
  if (name.length >= 3 && lower.includes(name)) errors.push('no incluir el nombre de usuario');
  if (COMMON_WORDS.some(word => lower.includes(word))) errors.push('no usar palabras comunes como «password» o «qwerty»');
  return errors;
}

export function validatePassword(password, username = '') {
  const errors = passwordPolicyErrors(password, username);
  return errors.length ? `La clave no cumple: ${errors.join('; ')}.` : null;
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

