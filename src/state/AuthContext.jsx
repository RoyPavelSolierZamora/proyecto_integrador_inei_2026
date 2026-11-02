import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DEMO_USERS } from '../data/demoData';
import { authError, authMode, createUserReal, getSession, listUsersReal, loginReal, logoutReal, retireUserReal, setUserActiveReal } from '../services/authClient';

const AuthContext = createContext(null);
const STORAGE_KEY = 'epen-demo-session';
const USERS_STORAGE_KEY = 'epen-demo-users-v1';

function initialUsers() {
  return DEMO_USERS.map((item, index) => ({
    ...item,
    id: index + 1,
    active: true,
    createdAt: '2026-11-02T08:00:00-05:00',
  }));
}

function readUsers() {
  try {
    const saved = JSON.parse(localStorage.getItem(USERS_STORAGE_KEY));
    return Array.isArray(saved) && saved.length ? saved : initialUsers();
  } catch {
    return initialUsers();
  }
}

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const real = authMode === 'real';
  const [user, setUser] = useState(() => real ? null : readSession());
  const [users, setUsers] = useState(() => real ? [] : readUsers());
  const [loading, setLoading] = useState(real);

  useEffect(() => {
    if (!real) {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
      return undefined;
    }
    let active = true;
    getSession()
      .then(data => { if (active) setUser(data.user); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [real]);

  async function login(username, password) {
    if (real) {
      try {
        const data = await loginReal(username, password);
        setUser(data.user);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: authError(error) };
      }
    }
    const found = users.find(item => item.username === username.trim().toLowerCase() && item.password === password && item.active);
    if (!found) return { ok: false, error: 'Usuario o clave de demostración incorrectos.' };
    const safeUser = { username: found.username, name: found.name, role: found.role };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(safeUser));
    setUser(safeUser);
    return { ok: true };
  }

  async function logout() {
    if (real) {
      try { await logoutReal(); } catch { /* La sesión local se cierra igualmente. */ }
      setUser(null);
      setUsers([]);
      return;
    }
    sessionStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }

  async function refreshUsers() {
    if (!real) return { ok: true };
    try {
      const data = await listUsersReal();
      setUsers(data.users);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: authError(error) };
    }
  }

  async function createUser(input) {
    if (real) {
      try {
        const data = await createUserReal(input);
        setUsers(current => [...current, data.user].sort((a, b) => a.name.localeCompare(b.name)));
        return { ok: true };
      } catch (error) {
        return { ok: false, error: authError(error) };
      }
    }
    const username = input.username.trim().toLowerCase();
    const name = input.name.trim();
    const password = input.password;
    if (!name) return { ok: false, error: 'Ingresa el nombre completo.' };
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) return { ok: false, error: 'El usuario debe tener entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo.' };
    if (users.some(item => item.username === username)) return { ok: false, error: 'Ese nombre de usuario ya existe.' };
    if (!['analista', 'supervisor', 'auditor', 'admin'].includes(input.role)) return { ok: false, error: 'Selecciona un rol válido.' };
    if (password.length < 8) return { ok: false, error: 'La clave temporal debe tener al menos 8 caracteres.' };
    setUsers(current => [...current, { id: Date.now(), username, name, password, role: input.role, active: true, createdAt: new Date().toISOString() }]);
    return { ok: true };
  }

  async function toggleUser(target) {
    if (real) {
      try {
        const data = await setUserActiveReal(target.id, !target.active);
        setUsers(current => current.map(item => item.id === target.id ? data.user : item));
        return { ok: true };
      } catch (error) {
        return { ok: false, error: authError(error) };
      }
    }
    const username = target.username;
    const found = users.find(item => item.username === username);
    if (!found) return { ok: false, error: 'La credencial ya no existe.' };
    if (found.username === user?.username) return { ok: false, error: 'No puedes desactivar tu propia sesión.' };
    if (found.role === 'admin' && found.active && users.filter(item => item.role === 'admin' && item.active).length === 1) {
      return { ok: false, error: 'Debe quedar al menos un administrador activo.' };
    }
    setUsers(current => current.map(item => item.username === username ? { ...item, active: !item.active } : item));
    return { ok: true };
  }

  async function removeUser(target) {
    if (real) {
      try {
        await retireUserReal(target.id);
        setUsers(current => current.filter(item => item.id !== target.id));
        return { ok: true };
      } catch (error) {
        return { ok: false, error: authError(error) };
      }
    }
    const username = target.username;
    const found = users.find(item => item.username === username);
    if (!found) return { ok: false, error: 'La credencial ya no existe.' };
    if (found.username === user?.username) return { ok: false, error: 'No puedes eliminar la credencial con la que estás conectado.' };
    if (found.role === 'admin' && found.active && users.filter(item => item.role === 'admin' && item.active).length === 1) {
      return { ok: false, error: 'Debe quedar al menos un administrador activo.' };
    }
    setUsers(current => current.filter(item => item.username !== username));
    return { ok: true };
  }

  const value = useMemo(() => ({ user, users, loading, authMode, login, logout, refreshUsers, createUser, toggleUser, removeUser }), [user, users, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe utilizarse dentro de AuthProvider');
  return context;
}
