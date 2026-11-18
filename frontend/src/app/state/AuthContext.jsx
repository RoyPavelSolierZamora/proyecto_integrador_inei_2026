import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authError, changeUserPasswordReal, createUserReal, getSession, listUsersReal, loginReal, logoutReal, retireUserReal, setUserActiveReal } from '../../shared/api/authClient.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getSession()
      .then(data => { if (active) setUser(data.user); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function login(username, password) {
    try {
      const data = await loginReal(username, password);
      setUser(data.user);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: authError(error) };
    }
  }

  async function logout() {
    try { await logoutReal(); } catch { /* La sesión visual se cierra igualmente. */ }
    setUser(null);
    setUsers([]);
  }

  async function refreshUsers() {
    try {
      const data = await listUsersReal();
      setUsers(data.users);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: authError(error) };
    }
  }

  async function createUser(input) {
    try {
      const data = await createUserReal(input);
      setUsers(current => [...current, data.user].sort((a, b) => a.name.localeCompare(b.name)));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: authError(error) };
    }
  }

  async function toggleUser(target) {
    try {
      const data = await setUserActiveReal(target.id, !target.active);
      setUsers(current => current.map(item => item.id === target.id ? data.user : item));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: authError(error) };
    }
  }

  // El servidor cierra todas las sesiones de la cuenta cambiada. Si es la propia, la sesión
  // visual también se cierra para que el usuario vuelva a ingresar con la clave nueva.
  async function changeUserPassword(target, input, isSelf) {
    try {
      await changeUserPasswordReal(target.id, input);
      if (isSelf) { setUser(null); setUsers([]); }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: authError(error) };
    }
  }

  async function removeUser(target) {
    try {
      await retireUserReal(target.id);
      setUsers(current => current.filter(item => item.id !== target.id));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: authError(error) };
    }
  }

  const value = useMemo(() => ({
    user, users, loading, login, logout, refreshUsers, createUser, toggleUser, removeUser, changeUserPassword,
  }), [user, users, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe utilizarse dentro de AuthProvider');
  return context;
}
