// Reglas de clave del dashboard. Espejo de backend/src/security/security.js: el backend es la
// fuente de verdad y vuelve a validar todo; aquí solo se muestra al usuario lo que se exigirá.
const COMMON_WORDS = ['password', 'contrasena', 'contraseña', 'qwerty', 'letmein', 'welcome', '123456', '12345678'];
const SYMBOLS = '!?#@$%&*+-=_.:;';

function hasSequence(value) {
  for (let index = 0; index + 3 < value.length; index += 1) {
    const codes = [0, 1, 2, 3].map(offset => value.charCodeAt(index + offset));
    const step = codes[1] - codes[0];
    if ((step === 1 || step === -1) && codes.every((code, offset) => offset === 0 || code - codes[offset - 1] === step)) {
      if (codes.every(code => /[a-z0-9]/i.test(String.fromCharCode(code)))) return true;
    }
  }
  return false;
}

export const PASSWORD_RULES = [
  { id: 'length', label: 'Entre 12 y 64 caracteres', test: value => value.length >= 12 && value.length <= 64 },
  { id: 'lower', label: 'Una letra minúscula', test: value => /[a-z]/.test(value) },
  { id: 'upper', label: 'Una letra mayúscula', test: value => /[A-Z]/.test(value) },
  { id: 'digit', label: 'Un número', test: value => /\d/.test(value) },
  { id: 'symbol', label: 'Un símbolo, por ejemplo ! ? # @', test: value => /[^A-Za-z0-9\s]/.test(value) },
  { id: 'repeat', label: 'Sin tres caracteres iguales seguidos', test: value => !/(.)\1\1/.test(value) },
  { id: 'sequence', label: 'Sin secuencias como 1234 o abcd', test: value => !hasSequence(value) },
  { id: 'common', label: 'Sin palabras comunes como «password»', test: value => !COMMON_WORDS.some(word => value.toLowerCase().includes(word)) },
  {
    id: 'username',
    label: 'Sin el nombre de usuario',
    test: (value, username) => {
      const name = String(username || '').trim().toLowerCase();
      return name.length < 3 || !value.toLowerCase().includes(name);
    },
  },
];

// Estado de cada regla para la lista de verificación. Una clave vacía no cumple ninguna.
export function passwordChecks(password, username = '') {
  const value = String(password || '');
  return PASSWORD_RULES.map(rule => ({ id: rule.id, label: rule.label, ok: value.length > 0 && rule.test(value, username) }));
}

export function passwordIsValid(password, username = '') {
  return passwordChecks(password, username).every(check => check.ok);
}

function randomInt(max) {
  const limit = 0xffffffff - (0xffffffff % max);
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % max;
}

// Genera una clave aleatoria de 24 caracteres que cumple todas las reglas. Usa el generador
// criptográfico del navegador y vuelve a intentarlo si el resultado no cumple.
export function generateStrongPassword(username = '') {
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = lower + upper + digits + SYMBOLS;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const chars = [lower, upper, digits, SYMBOLS].map(set => set[randomInt(set.length)]);
    while (chars.length < 24) chars.push(all[randomInt(all.length)]);
    for (let index = chars.length - 1; index > 0; index -= 1) {
      const swap = randomInt(index + 1);
      [chars[index], chars[swap]] = [chars[swap], chars[index]];
    }
    const candidate = chars.join('');
    if (passwordIsValid(candidate, username)) return candidate;
  }
  throw new Error('No se pudo generar una clave válida. Inténtalo nuevamente.');
}
