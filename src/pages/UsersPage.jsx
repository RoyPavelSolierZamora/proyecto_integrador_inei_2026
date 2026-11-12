import { useEffect, useMemo, useRef, useState } from 'react';
import { ROLE_LABELS } from '../data/roleLabels';
import { useAuth } from '../state/AuthContext';

const EMPTY_FORM = { name: '', username: '', role: 'analista', password: '' };
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
const formatDate = value => value && !Number.isNaN(Date.parse(value))
  ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(value)) : 'No disponible';

export default function UsersPage() {
  const { user, users, refreshUsers, createUser, toggleUser, removeUser } = useAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState('list');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const mutationBusy = useRef(false);
  const tabs = useRef(null);

  useEffect(() => {
    let active = true;
    refreshUsers().then(result => {
      if (active) { setLoadError(result.ok ? '' : result.error); setLoading(false); }
    });
    return () => { active = false; };
  }, []);

  async function retry() {
    setLoading(true); setLoadError('');
    const result = await refreshUsers();
    setLoadError(result.ok ? '' : result.error); setLoading(false);
  }

  const filtered = useMemo(() => users.filter(item =>
    (role === 'all' || item.role === role) && normalize(`${item.name} ${item.username}`).includes(normalize(query))
  ), [users, role, query]);
  const clearFilters = () => { setQuery(''); setRole('all'); };
  const change = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));

  function selectTab(next, focus = false) {
    setTab(next);
    if (focus) requestAnimationFrame(() => tabs.current?.querySelector(`#users-tab-${next}`)?.focus());
  }

  function tabKey(event) {
    const next = event.key === 'Home' ? 'list' : event.key === 'End' ? 'create'
      : ['ArrowLeft', 'ArrowRight'].includes(event.key) ? (tab === 'list' ? 'create' : 'list') : null;
    if (next) { event.preventDefault(); selectTab(next, true); }
  }

  async function perform(action, success) {
    if (mutationBusy.current) return;
    mutationBusy.current = true; setBusy(true); setMessage(null);
    try {
      const result = await action();
      if (result.ok) { setMessage({ type: 'success', text: success }); return true; }
      setMessage({ type: 'error', text: result.error });
    } catch {
      setMessage({ type: 'error', text: 'No se pudo completar la operación. Inténtalo nuevamente.' });
    } finally { mutationBusy.current = false; setBusy(false); }
    return false;
  }

  async function submit(event) {
    event.preventDefault();
    const created = await perform(() => createUser(form), `Usuario “${form.username.trim().toLowerCase()}” creado y activado.`);
    if (created) { setForm(EMPTY_FORM); clearFilters(); selectTab('list', true); }
  }

  async function toggle(target) {
    if (target.active && !window.confirm(`¿Deseas desactivar a “${target.username}”? Se cerrarán sus sesiones y no podrá ingresar al sistema mientras permanezca inactivo.`)) return;
    await perform(() => toggleUser(target), `Usuario “${target.username}” ${target.active ? 'desactivado' : 'activado'}.`);
  }

  async function remove(target) {
    if (!window.confirm(`¿Retirar al usuario “${target.username}”? Se cerrarán sus sesiones y ya no podrá ingresar al sistema ni aparecerá en esta lista.`)) return;
    await perform(() => removeUser(target), `Usuario “${target.username}” retirado.`);
  }

  return (
    <div className="page users-page">
      <div className="page-heading"><div><p className="eyebrow">Control de acceso</p><h1>Usuarios y credenciales</h1><p>Consulta las cuentas, administra sus accesos o crea un nuevo usuario.</p></div></div>
      <div className="section-tabs" role="tablist" aria-label="Gestión de usuarios" ref={tabs} onKeyDown={tabKey}>
        {[['list', 'Lista de usuarios'], ['create', 'Crear usuario']].map(([value, label]) => <button key={value} id={`users-tab-${value}`} type="button" role="tab" aria-selected={tab === value} aria-controls={`users-panel-${value}`} tabIndex={tab === value ? 0 : -1} onClick={() => selectTab(value)}>{label}</button>)}
      </div>
      {message && <div className={`notice notice--${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</div>}
      <section id="users-panel-list" role="tabpanel" aria-labelledby="users-tab-list" hidden={tab !== 'list'} tabIndex={0}>
        <div className="filter-bar users-filters" aria-label="Filtros de usuarios">
          <label>Buscar usuario<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nombre o nombre de usuario" /></label>
          <label>Tipo de usuario<select value={role} onChange={event => setRole(event.target.value)}><option value="all">Todos los usuarios</option>{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <button className="button button--secondary" type="button" onClick={clearFilters} disabled={!query && role === 'all'}>Restablecer filtros</button>
        </div>
        {loading ? <p className="notice" role="status">Cargando usuarios…</p>
          : loadError ? <div className="notice notice--error" role="alert"><strong>No se pudo actualizar la lista de usuarios.</strong><span>{loadError}</span><button className="button button--secondary" type="button" onClick={retry}>Reintentar</button></div>
          : <>
            <p className="filter-count" role="status">{filtered.length} de {users.length} usuarios</p>
            <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabla de usuarios">
              <table><caption className="sr-only">Cuentas de usuario y acciones permitidas</caption><thead><tr><th scope="col">Nombre</th><th scope="col">Nombre de usuario</th><th scope="col">Tipo de usuario</th><th scope="col">Estado</th><th scope="col">Fecha de creación</th><th scope="col">Acciones</th></tr></thead>
                <tbody>{filtered.map(item => <tr key={item.id}>
                  <td><strong>{item.name}</strong>{item.username === user.username && <small className="own-account">Tu cuenta</small>}</td><td>{item.username}</td><td>{ROLE_LABELS[item.role] || item.role}</td>
                  <td><span className={`access-state ${item.active ? 'access-state--active' : ''}`}>{item.active ? 'Activo' : 'Inactivo'}</span></td><td>{formatDate(item.createdAt)}</td>
                  <td><div className="user-table-actions"><button className="button button--secondary" type="button" disabled={busy || item.username === user.username} onClick={() => toggle(item)} aria-label={`${item.active ? 'Desactivar' : 'Activar'} a ${item.username}`}>{item.active ? 'Desactivar' : 'Activar'}</button><button className="button button--danger-quiet" type="button" disabled={busy || item.username === user.username} onClick={() => remove(item)} aria-label={`Retirar a ${item.username}`}>Retirar</button></div></td>
                </tr>)}</tbody>
              </table>
              {!filtered.length && <p className="empty-state">{users.length ? 'No encontramos usuarios con los filtros seleccionados.' : 'Todavía no hay usuarios registrados.'}</p>}
            </div>
          </>}
      </section>
      <section id="users-panel-create" role="tabpanel" aria-labelledby="users-tab-create" hidden={tab !== 'create'} tabIndex={0}>
        <div className="panel user-create-panel">
          <div className="panel-heading"><div><h2>Crear usuario</h2><p>Todos los campos son obligatorios. La cuenta se creará activa.</p></div></div>
          <form className="stack-form user-create-form" onSubmit={submit}>
            <label>Nombre completo<input name="name" value={form.name} onChange={change} autoComplete="off" maxLength={120} required disabled={busy} /></label>
            <label><span id="create-username-label">Nombre de usuario</span><input aria-labelledby="create-username-label" name="username" value={form.username} onChange={change} autoComplete="off" placeholder="ej. mquispe" required disabled={busy} aria-describedby="username-help" /><small id="username-help">De 3 a 30 caracteres: letras sin tildes, números, punto, guion o guion bajo.</small></label>
            <label>Tipo de usuario<select name="role" value={form.role} onChange={change} disabled={busy}>{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span id="create-password-label">Clave temporal</span><input aria-labelledby="create-password-label" name="password" type="password" value={form.password} onChange={change} autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy} aria-describedby="password-help" /><small id="password-help">Entre 12 y 128 caracteres.</small></label>
            <div className="user-form-actions"><button className="button button--primary" type="submit" disabled={busy}>{busy ? 'Creando…' : 'Crear usuario'}</button><button className="button button--secondary" type="button" disabled={busy} onClick={() => { setForm(EMPTY_FORM); setMessage(null); selectTab('list', true); }}>Cancelar</button></div>
          </form>
        </div>
      </section>
    </div>
  );
}
