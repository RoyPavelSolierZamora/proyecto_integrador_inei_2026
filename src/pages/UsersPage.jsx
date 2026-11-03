import { useEffect, useState } from 'react';
import { ROLE_LABELS } from '../data/roleLabels';
import { useAuth } from '../state/AuthContext';

const EMPTY_FORM = { name: '', username: '', role: 'analista', password: '' };

export default function UsersPage() {
  const { user, users, refreshUsers, createUser, toggleUser, removeUser } = useAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    refreshUsers().then(result => {
      if (!result.ok) setMessage({ type: 'error', text: result.error });
    });
  }, []);

  function change(event) {
    setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    const result = await createUser(form);
    setBusy(false);
    setMessage(result.ok ? { type: 'success', text: `Credencial “${form.username.trim().toLowerCase()}” creada y activada.` } : { type: 'error', text: result.error });
    if (result.ok) setForm(EMPTY_FORM);
  }

  async function toggle(target) {
    setBusy(true);
    const result = await toggleUser(target);
    setBusy(false);
    setMessage(result.ok ? { type: 'success', text: 'Estado de la credencial actualizado.' } : { type: 'error', text: result.error });
  }

  async function remove(target) {
    if (!window.confirm(`¿Retirar la credencial “${target.username}”? Se cerrarán todas sus sesiones activas.`)) return;
    setBusy(true);
    const result = await removeUser(target);
    setBusy(false);
    setMessage(result.ok ? { type: 'success', text: `Credencial “${target.username}” retirada.` } : { type: 'error', text: result.error });
  }

  return (
    <div className="page">
      <div className="page-heading"><div><p className="eyebrow">Control de acceso</p><h1>Usuarios y credenciales</h1><p>Crea, desactiva o retira accesos y asigna el rol mínimo necesario.</p></div></div>
      <div className="notice notice--success"><strong>Persistencia PostgreSQL</strong><span>Las contraseñas se almacenan como hash scrypt y los permisos se validan en el servidor.</span></div>
      {message && <div className={`notice notice--${message.type}`} role="status">{message.text}</div>}
      <div className="admin-grid">
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Nueva credencial</p><h2>Crear usuario</h2></div></div>
          <form className="stack-form" onSubmit={submit}>
            <label>Nombre completo<input name="name" value={form.name} onChange={change} autoComplete="off" required /></label>
            <label>Nombre de usuario<input name="username" value={form.username} onChange={change} autoComplete="off" placeholder="ej. mquispe" required /></label>
            <label>Rol<select name="role" value={form.role} onChange={change}>{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Clave temporal<input name="password" type="password" value={form.password} onChange={change} autoComplete="new-password" minLength="12" required /></label>
            <button className="button button--primary" type="submit" disabled={busy}>{busy ? 'Procesando…' : 'Crear credencial'}</button>
          </form>
        </section>
        <section className="panel panel--user-list">
          <div className="panel-heading"><div><p className="eyebrow">Directorio PostgreSQL</p><h2>{users.length} credenciales</h2></div></div>
          <div className="user-list">
            {users.map(item => (
              <article className="user-card" key={item.username}>
                <div className="user-card__identity"><strong>{item.name}</strong><span>@{item.username} · {ROLE_LABELS[item.role]}</span></div>
                <span className={`access-state ${item.active ? 'access-state--active' : ''}`}>{item.active ? 'Activo' : 'Inactivo'}</span>
                <div className="user-card__actions">
                  <button className="button button--secondary" type="button" disabled={busy || item.username === user.username} onClick={() => toggle(item)}>{item.active ? 'Desactivar' : 'Activar'}</button>
                  <button className="button button--danger-quiet" type="button" disabled={busy || item.username === user.username} onClick={() => remove(item)}>Retirar</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
