import { useEffect, useMemo, useRef, useState } from 'react';
import { ROLE_LABELS } from '../../shared/lib/roleLabels.js';
import PageHeader from '../../shared/ui/PageHeader.jsx';
import PanelHeading from '../../shared/ui/PanelHeading.jsx';
import Panel from '../../shared/ui/Panel.jsx';
import Button from '../../shared/ui/Button.jsx';
import Notice from '../../shared/ui/Notice.jsx';
import { tableClasses as t } from '../../shared/ui/tableClasses.js';
import Field, { inputClass } from '../../shared/ui/Field.jsx';
import { useAuth } from '../../app/state/AuthContext.jsx';
import { generateStrongPassword, passwordChecks, passwordIsValid } from '../../shared/lib/passwordPolicy.js';
import { setUserAnalystCodeReal } from '../../shared/api/dataClient.js';

const EMPTY_FORM = { name: '', username: '', role: 'analista', password: '' };
const EMPTY_PASSWORD_FORM = { currentPassword: '', password: '', confirm: '' };
const normalize = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es').trim();
const formatDate = value => value && !Number.isNaN(Date.parse(value))
  ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(value)) : 'No disponible';

const tabs = [['list', 'Lista de usuarios'], ['create', 'Crear usuario']];
const tabClass = active => [
  'min-h-11 cursor-pointer appearance-none border-0 rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
  active ? 'bg-brand text-white shadow-sm' : 'bg-transparent text-ink hover:bg-brand-soft',
].join(' ');

// Lista de requisitos de la clave. Se muestra igual en cambio de clave y en alta de usuario.
// Con columns, los requisitos se reparten en tres columnas en escritorio (para ocupar todo el ancho).
function PasswordRules({ id, checks, columns = false }) {
  return (
    <div className="grid content-start gap-3 rounded-xl border border-line bg-[#f5f8fd] p-4">
      <h3 className="text-sm font-semibold text-ink-strong">Requisitos de la clave</h3>
      <ul id={id} aria-label="Requisitos de la clave" className={['grid gap-2 text-sm', columns ? 'md:grid-cols-3' : ''].join(' ')}>
        {checks.map(rule => (
          <li key={rule.id} className={['flex items-start gap-2', rule.ok ? 'text-[#05603a]' : 'text-muted'].join(' ')}>
            <span className="sr-only">{rule.ok ? 'Cumple: ' : 'Falta: '}</span>
            <span aria-hidden="true" className="w-4 flex-none text-center font-semibold">{rule.ok ? '✓' : '○'}</span>
            <span>{rule.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function UsersPage() {
  const { user, users, refreshUsers, createUser, toggleUser, removeUser, changeUserPassword } = useAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [createConfirm, setCreateConfirm] = useState('');
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [createError, setCreateError] = useState('');
  const [passwordFor, setPasswordFor] = useState(null);
  const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD_FORM);
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [analystEdit, setAnalystEdit] = useState(null);
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

  function closePassword() {
    setPasswordFor(null);
    setPasswordForm(EMPTY_PASSWORD_FORM);
    setShowPasswords(false);
    setPasswordError('');
  }

  function resetCreate() {
    setForm(EMPTY_FORM);
    setCreateConfirm('');
    setShowCreatePassword(false);
    setCreateError('');
  }

  // Al cambiar de pestaña se cierra el cambio de clave: no debe quedar abierto sobre la otra vista.
  function selectTab(next, focus = false) {
    if (next !== tab) closePassword();
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

  // La validación de la interfaz solo orienta; el backend vuelve a aplicar todas las reglas.
  async function submit(event) {
    event.preventDefault();
    if (!passwordIsValid(form.password, form.username)) return setCreateError('La clave temporal todavía no cumple todos los requisitos.');
    if (form.password !== createConfirm) return setCreateError('La confirmación no coincide con la clave temporal.');
    setCreateError('');
    const created = await perform(() => createUser(form), `Usuario “${form.username.trim().toLowerCase()}” creado y activado.`);
    if (created) { resetCreate(); clearFilters(); selectTab('list', true); }
  }

  function fillCreateGenerated() {
    try {
      const generated = generateStrongPassword(form.username);
      setForm(current => ({ ...current, password: generated }));
      setCreateConfirm(generated);
      setShowCreatePassword(true);
      setCreateError('');
    } catch (cause) {
      setCreateError(cause.message);
    }
  }

  async function toggle(target) {
    if (target.active && !window.confirm(`¿Deseas desactivar a “${target.username}”? Se cerrarán sus sesiones y no podrá ingresar al sistema mientras permanezca inactivo.`)) return;
    await perform(() => toggleUser(target), `Usuario “${target.username}” ${target.active ? 'desactivado' : 'activado'}.`);
  }

  async function remove(target) {
    if (!window.confirm(`¿Retirar al usuario “${target.username}”? Se cerrarán sus sesiones y ya no podrá ingresar al sistema ni aparecerá en esta lista.`)) return;
    await perform(() => removeUser(target), `Usuario “${target.username}” retirado.`);
  }

  // Código de analista: se usa para auditar la base codificada. Debe ser único en el sistema.
  async function saveAnalystCode(target, value) {
    setBusy(true);
    setMessage(null);
    try {
      await setUserAnalystCodeReal(target.id, value.trim());
      setAnalystEdit(null);
      setMessage({ type: 'success', text: value.trim() ? `Código de analista de “${target.username}” guardado.` : `Código de analista de “${target.username}” quitado.` });
      await refreshUsers();
    } catch (cause) {
      setMessage({ type: 'error', text: cause.message });
    } finally {
      setBusy(false);
    }
  }

  function openPassword(target) {
    setPasswordFor(target);
    setPasswordForm(EMPTY_PASSWORD_FORM);
    setShowPasswords(false);
    setPasswordError('');
    setMessage(null);
  }

  const changePasswordField = event => setPasswordForm(current => ({ ...current, [event.target.name]: event.target.value }));

  function fillGeneratedPassword() {
    try {
      const generated = generateStrongPassword(passwordFor.username);
      setPasswordForm(current => ({ ...current, password: generated, confirm: generated }));
      setShowPasswords(true);
      setPasswordError('');
    } catch (cause) {
      setPasswordError(cause.message);
    }
  }

  // El backend vuelve a aplicar todas las reglas y además exige la clave actual cuando la cuenta es la propia.
  async function submitPassword(event) {
    event.preventDefault();
    const target = passwordFor;
    const self = target.username === user.username;
    const { currentPassword, password, confirm } = passwordForm;
    if (self && !currentPassword) return setPasswordError('Escribe tu clave actual para cambiar tu propia clave.');
    if (!passwordIsValid(password, target.username)) return setPasswordError('La clave nueva todavía no cumple todos los requisitos.');
    if (password !== confirm) return setPasswordError('La confirmación no coincide con la clave nueva.');
    if (self && password === currentPassword) return setPasswordError('La clave nueva debe ser distinta de la actual.');
    setPasswordError('');
    const input = self ? { password, currentPassword } : { password };
    const changed = await perform(
      () => changeUserPassword(target, input, self),
      `Clave de “${target.username}” actualizada. Sus sesiones anteriores se cerraron.`,
    );
    if (changed) closePassword();
  }

  const passwordTarget = passwordFor;
  const passwordRules = passwordTarget ? passwordChecks(passwordForm.password, passwordTarget.username) : [];
  const createRules = passwordChecks(form.password, form.username);

  const roleOptions = Object.entries(ROLE_LABELS);
  const isOwn = item => item.username === user.username;

  return (
    <div className="grid grid-cols-1 gap-4">
      <PageHeader
        icon="people"
        title="Usuarios y credenciales"
        description="Consulta las cuentas, administra sus accesos o crea un nuevo usuario."
      />

      <div role="tablist" aria-label="Gestión de usuarios" ref={tabList} onKeyDown={tabKey} className="flex flex-wrap gap-1 rounded-xl border border-line bg-white p-1.5">
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

      {passwordTarget && (
        <Panel className="p-5" aria-label={`Cambiar clave de ${passwordTarget.username}`}>
          <PanelHeading
            title={`Cambiar clave de ${passwordTarget.username}`}
            description={passwordTarget.username === user.username
              ? 'Es tu cuenta: escribe primero tu clave actual. Al guardar se cerrarán todas tus sesiones y deberás volver a ingresar.'
              : 'La clave nueva reemplaza la anterior y cierra las sesiones activas de esta cuenta. Entrégala por un canal seguro; no la envíes por chat ni por correo.'}
          />
          <form className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start" onSubmit={submitPassword} autoComplete="off">
            <div className="grid content-start gap-4">
              {passwordTarget.username === user.username && (
                <Field id="usuarios-clave-actual" label="Clave actual">
                  <input id="usuarios-clave-actual" name="currentPassword" type="password" className={inputClass} value={passwordForm.currentPassword} onChange={changePasswordField} autoComplete="current-password" required disabled={busy} />
                </Field>
              )}
              <Field id="usuarios-clave-nueva" label="Clave nueva" hint="Se verifica también en el servidor. No se guarda en el navegador ni se vuelve a mostrar.">
                <input id="usuarios-clave-nueva" name="password" type={showPasswords ? 'text' : 'password'} className={inputClass} value={passwordForm.password} onChange={changePasswordField} autoComplete="new-password" minLength={12} maxLength={64} required disabled={busy} aria-describedby="usuarios-clave-nueva-ayuda usuarios-clave-reglas" />
              </Field>
              <Field id="usuarios-clave-confirmar" label="Confirmar clave nueva">
                <input id="usuarios-clave-confirmar" name="confirm" type={showPasswords ? 'text' : 'password'} className={inputClass} value={passwordForm.confirm} onChange={changePasswordField} autoComplete="new-password" maxLength={64} required disabled={busy} />
              </Field>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" disabled={busy} onClick={fillGeneratedPassword}>Generar clave segura</Button>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={showPasswords} onChange={event => setShowPasswords(event.target.checked)} disabled={busy} />
                  Mostrar claves
                </label>
              </div>
              {passwordError && <Notice tone="error">{passwordError}</Notice>}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar clave nueva'}</Button>
                <Button variant="secondary" disabled={busy} onClick={closePassword}>Cancelar</Button>
              </div>
            </div>
            <PasswordRules id="usuarios-clave-reglas" checks={passwordRules} />
          </form>
        </Panel>
      )}

      <section id="users-panel-list" role="tabpanel" aria-labelledby="users-tab-list" hidden={tab !== 'list'} tabIndex={0} className="grid grid-cols-1 gap-4">
        <div aria-label="Filtros de usuarios" className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
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
            <div tabIndex={0} role="region" aria-label="Tabla de usuarios" className={t.wrap}>
              <table className={t.table}>
                <caption className="sr-only">Cuentas de usuario y acciones permitidas</caption>
                <thead className={t.head}>
                  <tr>
                    <th scope="col" className={t.th}>Nombre</th>
                    <th scope="col" className={t.th}>Nombre de usuario</th>
                    <th scope="col" className={t.th}>Tipo de usuario</th>
                    <th scope="col" className={t.th}>Código de analista</th>
                    <th scope="col" className={t.th}>Estado</th>
                    <th scope="col" className={t.th}>Fecha de creación</th>
                    <th scope="col" className={t.th}>Acciones</th>
                  </tr>
                </thead>
                <tbody className={t.body}>
                  {filtered.map(item => (
                    <tr key={item.id} className={t.row}>
                      <td data-label="Nombre" className={t.cell}>
                        <strong className="text-ink-strong">{item.name}</strong>
                        {isOwn(item) && <small className="ml-2 whitespace-nowrap rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-navy">Tu cuenta</small>}
                      </td>
                      <td data-label="Nombre de usuario" className={t.cell}>{item.username}</td>
                      <td data-label="Tipo de usuario" className={t.cell}>{ROLE_LABELS[item.role] || item.role}</td>
                      <td data-label="Código de analista" className={t.cell}>
                        {analystEdit?.id === item.id ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <input aria-label={`Código de analista de ${item.username}`} className={`${inputClass} w-40`} value={analystEdit.value} maxLength={20} onChange={event => setAnalystEdit({ id: item.id, value: event.target.value })} disabled={busy} placeholder="ej. ANALISTA001" />
                            <Button size="sm" disabled={busy} onClick={() => saveAnalystCode(item, analystEdit.value)}>Guardar</Button>
                            <Button variant="quiet" size="sm" disabled={busy} onClick={() => setAnalystEdit(null)}>Cancelar</Button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            {item.analystCode ? <strong className="text-ink-strong">{item.analystCode}</strong> : <span className="text-muted">Sin asignar</span>}
                            <Button variant="quiet" size="sm" disabled={busy} onClick={() => setAnalystEdit({ id: item.id, value: item.analystCode || '' })} aria-label={`Editar código de analista de ${item.username}`}>Editar</Button>
                          </div>
                        )}
                      </td>
                      <td data-label="Estado" className={t.cell}>
                        <span className={['inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold', item.active ? 'bg-[#e4f7ec] text-[#05603a]' : 'bg-line text-muted'].join(' ')}>
                          {item.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td data-label="Fecha de creación" className={t.cell}>{formatDate(item.createdAt)}</td>
                      <td data-label="Acciones" className={`${t.cell} md:whitespace-nowrap`}>
                        <div className="flex flex-wrap gap-2 md:flex-nowrap">
                          <Button variant="secondary" size="sm" disabled={busy} onClick={() => openPassword(item)} aria-label={`Cambiar clave de ${item.username}`}>
                            Cambiar clave
                          </Button>
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
        <Panel className="p-5">
          <PanelHeading title="Crear usuario" description="Todos los campos son obligatorios. La cuenta se creará activa." />
          <form className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start" onSubmit={submit} autoComplete="off">
            <div className="grid content-start gap-4">
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
              {createError && <Notice tone="error">{createError}</Notice>}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy}>{busy ? 'Creando…' : 'Crear usuario'}</Button>
                <Button variant="secondary" disabled={busy} onClick={() => { resetCreate(); setMessage(null); selectTab('list', true); }}>Cancelar</Button>
              </div>
            </div>

            <div className="grid content-start gap-4">
              <Field id="usuarios-clave" label="Clave temporal" hint="Se verifica también en el servidor. Entrégala por un canal seguro.">
                <input id="usuarios-clave" name="password" type={showCreatePassword ? 'text' : 'password'} className={inputClass} value={form.password} onChange={change} autoComplete="new-password" minLength={12} maxLength={64} required disabled={busy} aria-describedby="usuarios-clave-ayuda usuarios-clave-reglas-alta" />
              </Field>
              <Field id="usuarios-clave-confirmar-alta" label="Confirmar clave temporal">
                <input id="usuarios-clave-confirmar-alta" type={showCreatePassword ? 'text' : 'password'} className={inputClass} value={createConfirm} onChange={event => setCreateConfirm(event.target.value)} autoComplete="new-password" maxLength={64} required disabled={busy} />
              </Field>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" disabled={busy} onClick={fillCreateGenerated}>Generar clave segura</Button>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={showCreatePassword} onChange={event => setShowCreatePassword(event.target.checked)} disabled={busy} />
                  Mostrar claves
                </label>
              </div>
            </div>
            <div className="md:col-span-2">
              <PasswordRules id="usuarios-clave-reglas-alta" checks={createRules} columns />
            </div>
          </form>
        </Panel>
      </section>
    </div>
  );
}
