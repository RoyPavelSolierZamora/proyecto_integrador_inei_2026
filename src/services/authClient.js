export const authMode = import.meta.env.VITE_AUTH_MODE || 'demo';
let csrfToken = null;

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function apiRequest(path, options = {}) {
  const headers = { Accept: 'application/json', ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.mutation && csrfToken) headers['X-CSRF-Token'] = csrfToken;
  const response = await fetch(path, {
    method: options.method || 'GET',
    credentials: 'include',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || 'No se pudo completar la operación.', response.status);
  if (data.csrfToken) csrfToken = data.csrfToken;
  return data;
}

export async function getSession() {
  return apiRequest('/api/auth/me');
}

export async function loginReal(username, password) {
  return apiRequest('/api/auth/login', { method: 'POST', body: { username, password } });
}

export async function logoutReal() {
  try { await apiRequest('/api/auth/logout', { method: 'POST', mutation: true }); }
  finally { csrfToken = null; }
}

export async function listUsersReal() {
  return apiRequest('/api/admin/users');
}

export async function createUserReal(input) {
  return apiRequest('/api/admin/users', { method: 'POST', mutation: true, body: input });
}

export async function setUserActiveReal(id, active) {
  return apiRequest(`/api/admin/users/${id}/status`, { method: 'PATCH', mutation: true, body: { active } });
}

export async function retireUserReal(id) {
  return apiRequest(`/api/admin/users/${id}`, { method: 'DELETE', mutation: true });
}

export function authError(error) {
  if (error instanceof ApiError) return error.message;
  return 'No se pudo conectar con el backend de autenticación.';
}

