import { useEffect, useMemo, useRef, useState } from 'react';
import { ROLE_LABELS } from '../../shared/lib/roleLabels.js';
import PageHeader from '../../shared/ui/PageHeader.jsx';
import PanelHeading from '../../shared/ui/PanelHeading.jsx';
import Panel from '../../shared/ui/Panel.jsx';
import Button from '../../shared/ui/Button.jsx';
import Notice from '../../shared/ui/Notice.jsx';
import Field, { inputClass } from '../../shared/ui/Field.jsx';
import { useAuth } from '../../app/state/AuthContext.jsx';

const EMPTY_FORM = { name: '', username: '', role: 'analista', password: '' };
const normalize = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es').trim();
const formatDate = value => value && !Number.isNaN(Date.parse(value))
  ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(value)) : 'No disponible';

const tabs = [['list', 'Lista de usuarios'], ['create', 'Crear usuario']];
const tabClass = active => [
  'min-h-10 border-b-2 px-3 text-sm font-semibold',
  active ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink-strong',
].join(' ');

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
  const tabList = useRef(null);

  useEffect(() => {
    let active = true;
    refreshUsers().then(result => {
      if (active) { setLoadError(result.ok ? '' : result.error); setLoading(false); }
    });
    return () => { active = false; };
  }, []);

  async function retry() {
    setLoading(true);
    setLoadError('');
    const result = await refreshUsers();
    setLoadError(result.ok ? '' : result.error);
    setLoading(false);
  }

  const filtered = useMemo(() => users.filter(item =>
    (role === 'all' || item.role === role) && normalize(`${item.name} ${item.username}`).includes(normalize(query))
  ), [users, role, query]);
  const clearFilters = () => { setQuery(''); setRole('all'); };
  const change = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));

  function selectTab(next, focus = false) {
    setTab(next);
    if (focus) requestAnimationFrame(() => tabList.current?.querySelector(`#users-tab-${next}`)?.focus());
  }

  function tabKey(event) {
    const next = event.key === 'Home' ? 'list' : event.key === 'End' ? 'create'
      : ['ArrowLeft', 'ArrowRight'].includes(event.key) ? (tab === 'list' ? 'create' : 'list') : null;
    if (next) { event.preventDefault(); selectTab(next, true); }
  }

  async function perform(action, success) {
    if (mutationBusy.current) return false;
    mutationBusy.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      if (result.ok) { setMessage({ type: 'success', text: success }); return true; }
      setMessage({ type: 'error', text: result.error });
    } catch {
      setMessage({ type: 'error', text: 'No se pudo completar la operación. Inténtalo nuevamente.' });
    } finally {
      mutationBusy.current = false;
      setBusy(false);
    }
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

  const roleOptions = Object.entries(ROLE_LABELS);
  const isOwn = item => item.username === user.username;

  return (
    <div className="grid gap-6">
      <PageHeader
        icon="people"
        title="Usuarios y credenciales"
        description="Consulta las cuentas, administra sus accesos o crea un nuevo usuario."
      />

      <div role="tablist" aria-label="Gestión de usuarios" ref={tabList} onKeyDown={tabKey} className="flex gap-1 border-b border-line">
        {tabs.map(([value, label]) => (
          <button
            key={value}
            id={`users-tab-${value}`}
            type="button"
            role="tab"
            aria-selected={tab === value}
            aria-controls={`users-panel-${value}`}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => selectTab(value)}
            className={tabClass(tab === value)}
          >
            {label}
          </button>
        ))}
      </div>

      {message && <Notice tone={message.type}>{message.text}</Notice>}

      <section id="users-panel-list" role="tabpanel" aria-labelledby="users-tab-list" hidden={tab !== 'list'} tabIndex={0} className="grid gap-4">
        <div aria-label="Filtros de usuarios" className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
          <Field id="usuarios-buscar" label="Buscar usuario">
            <input id="usuarios-buscar" type="search" className={inputClass} value={query} onChange={event => setQuery(event.target.value)} placeholder="Nombre o nombre de usuario" />
          </Field>
          <Field id="usuarios-tipo" label="Tipo de usuario">
            <select id="usuarios-tipo" className={inputClass} value={role} onChange={event => setRole(event.target.value)}>
              <option value="all">Todos los usuarios</option>
              {roleOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Button variant="secondary" onClick={clearFilters} disabled={!query && role === 'all'}>Restablecer filtros</Button>
        </div>

        {loading && <Panel className="p-4 text-sm text-muted" role="status">Cargando usuarios…</Panel>}
        {!loading && loadError && (
          <Notice tone="error" title="No se pudo actualizar la lista de usuarios." actions={<Button variant="secondary" onClick={retry}>Reintentar</Button>}>
            {loadError}
          </Notice>
        )}
        {!loading && !loadError && (
          <>
            <p role="status" className="text-sm text-muted">{filtered.length} de {users.length} usuarios</p>
            <div tabIndex={0} role="region" aria-label="Tabla de usuarios" className="overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full min-w-[760px] text-left text-sm">
                <caption className="sr-only">Cuentas de usuario y acciones permitidas</caption>
                <thead className="bg-[#f5f8fd] text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Nombre</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Nombre de usuario</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Tipo de usuario</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Estado</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Fecha de creación</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => (
                    <tr key={item.id} className="border-t border-line align-middle">
                      <td className="px-4 py-3">
                        <strong className="text-ink-strong">{item.name}</strong>
                        {isOwn(item) && <small className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-navy">Tu cuenta</small>}
                      </td>
                      <td className="px-4 py-3">{item.username}</td>
                      <td className="px-4 py-3">{ROLE_LABELS[item.role] || item.role}</td>
                      <td className="px-4 py-3">
                        <span className={['rounded-full px-2.5 py-1 text-xs font-semibold', item.active ? 'bg-[#e4f7ec] text-[#05603a]' : 'bg-line text-muted'].join(' ')}>
                          {item.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-3">{formatDate(item.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button variant="secondary" size="sm" disabled={busy || isOwn(item)} onClick={() => toggle(item)} aria-label={`${item.active ? 'Desactivar' : 'Activar'} a ${item.username}`}>
                            {item.active ? 'Desactivar' : 'Activar'}
                          </Button>
                          <Button variant="danger" size="sm" disabled={busy || isOwn(item)} onClick={() => remove(item)} aria-label={`Retirar a ${item.username}`}>
                            Retirar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filtered.length && (
                <p className="px-4 py-8 text-center text-sm text-muted">
                  {users.length ? 'No encontramos usuarios con los filtros seleccionados.' : 'Todavía no hay usuarios registrados.'}
                </p>
              )}
            </div>
          </>
        )}
      </section>

      <section id="users-panel-create" role="tabpanel" aria-labelledby="users-tab-create" hidden={tab !== 'create'} tabIndex={0}>
        <Panel className="max-w-2xl p-5">
          <PanelHeading title="Crear usuario" description="Todos los campos son obligatorios. La cuenta se creará activa." />
          <form className="grid gap-4" onSubmit={submit}>
            <Field id="usuarios-nombre" label="Nombre completo">
              <input id="usuarios-nombre" name="name" className={inputClass} value={form.name} onChange={change} autoComplete="off" maxLength={120} required disabled={busy} />
            </Field>
            <Field id="usuarios-username" label="Nombre de usuario" hint="De 3 a 30 caracteres: letras sin tildes, números, punto, guion o guion bajo.">
              <input id="usuarios-username" name="username" className={inputClass} value={form.username} onChange={change} autoComplete="off" placeholder="ej. mquispe" required disabled={busy} aria-describedby="usuarios-username-ayuda" />
            </Field>
            <Field id="usuarios-rol" label="Tipo de usuario">
              <select id="usuarios-rol" name="role" className={inputClass} value={form.role} onChange={change} disabled={busy}>
                {roleOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field id="usuarios-clave" label="Clave temporal" hint="Entre 12 y 128 caracteres.">
              <input id="usuarios-clave" name="password" type="password" className={inputClass} value={form.password} onChange={change} autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy} aria-describedby="usuarios-clave-ayuda" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>{busy ? 'Creando…' : 'Crear usuario'}</Button>
              <Button variant="secondary" disabled={busy} onClick={() => { setForm(EMPTY_FORM); setMessage(null); selectTab('list', true); }}>Cancelar</Button>
            </div>
          </form>
        </Panel>
      </section>
    </div>
  );
}
