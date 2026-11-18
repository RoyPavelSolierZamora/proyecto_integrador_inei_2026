import { useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { ROLE_LABELS } from '../shared/lib/roleLabels.js';
import { useAuth } from './state/AuthContext.jsx';
import { useData } from './state/DataContext.jsx';
import EpenIcon from '../shared/ui/EpenIcon.jsx';
import Button from '../shared/ui/Button.jsx';
import Notice from '../shared/ui/Notice.jsx';
import Panel from '../shared/ui/Panel.jsx';
import AssistantDock from '../features/asistente/AssistantDock.jsx';

// Cada entrada define qué ve cada rol. Agregar una pantalla es agregar una línea aquí.
const navItems = [
  { group: 'Trabajo', to: '/', label: 'Inicio', icon: 'house-door', end: true, roles: ['operador', 'analista', 'supervisor', 'auditor', 'admin'] },
  { group: 'Trabajo', to: '/casos', label: 'Codificación', icon: 'clipboard-check', roles: ['analista', 'supervisor', 'auditor', 'admin'] },
  { group: 'Trabajo', to: '/bases', label: 'Bases', icon: 'database', roles: ['operador', 'admin'] },
  { group: 'Supervisión', to: '/metricas', label: 'Métricas', icon: 'bar-chart', roles: ['supervisor', 'auditor', 'admin'] },
  { group: 'Supervisión', to: '/calidad', label: 'Control de calidad', icon: 'shield-check', roles: ['supervisor', 'auditor', 'admin'] },
  { group: 'Supervisión', to: '/historial', label: 'Auditoría', icon: 'clock-history', roles: ['supervisor', 'auditor', 'admin'] },
  { group: 'Administración', to: '/criterios', label: 'Catálogo y criterios', icon: 'journal-check', roles: ['supervisor', 'auditor', 'admin'] },
  { group: 'Administración', to: '/usuarios', label: 'Usuarios', icon: 'people', roles: ['admin'] },
  { group: 'Administración', to: '/sistema', label: 'Servicios', icon: 'gear', roles: ['admin'] },
];

// Enlace activo: fondo suave y una barra azul a la izquierda.
const navLinkClass = ({ isActive }) => [
  'relative flex min-h-11 items-center gap-3.5 rounded-[10px] px-3.5 py-2.5 text-[15px] font-medium text-[#233750] hover:bg-[#e8f2ff]',
  isActive ? 'bg-[linear-gradient(90deg,#d9e9ff,#c6ddfa)] font-bold text-[#053b7b] before:absolute before:inset-y-0 before:left-0 before:w-1 before:rounded-l-md before:bg-[#075cbb] before:content-[""]' : '',
].join(' ');

export default function AppShell() {
  const { user, logout } = useAuth();
  const { loading, error, reload } = useData();
  const [open, setOpen] = useState(false);
  const menuButton = useRef(null);
  const sidebar = useRef(null);

  function closeMenu() {
    setOpen(false);
    menuButton.current?.focus();
  }

  function openMenu() {
    setOpen(true);
    requestAnimationFrame(() => sidebar.current?.querySelector('a')?.focus());
  }

  const items = navItems.filter(item => item.roles.includes(user.role));
  const groups = [...new Set(items.map(item => item.group))];

  return (
    <div
      className="min-h-screen bg-canvas md:grid md:grid-cols-[245px_minmax(0,1fr)] md:grid-rows-[70px_1fr]"
      onKeyDown={event => { if (event.key === 'Escape' && open) closeMenu(); }}
    >
      <header className="sticky top-0 z-20 flex h-[70px] items-center gap-4 border-b border-line bg-surface px-4 shadow-sm md:col-start-2 md:row-start-1 md:px-7">
        <button
          ref={menuButton}
          type="button"
          aria-label={open ? 'Cerrar navegación' : 'Abrir navegación'}
          aria-expanded={open}
          aria-controls="epen-sidebar"
          onClick={() => (open ? closeMenu() : openMenu())}
          className="grid size-10 flex-none place-items-center rounded-lg border border-[#b7c9df] text-brand md:hidden"
        >
          <EpenIcon name={open ? 'x-lg' : 'list'} />
        </button>
        <div className="flex min-w-0 items-center gap-4">
          <EpenIcon name="layers" />
          <span className="hidden h-8 w-px bg-[#9bacbf] sm:block" aria-hidden="true" />
          <div className="min-w-0">
            <strong className="block truncate text-lg font-bold text-ink-strong md:text-2xl">Codificación EPEN</strong>
            <small className="block text-xs text-muted">Entorno de trabajo</small>
          </div>
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-3 rounded-full border border-[#d4e2f4] bg-[#f9fbff] py-1 pl-3 pr-1.5">
          <span className="hidden min-w-0 sm:block">
            <strong className="block truncate text-sm text-ink-strong">{user.name}</strong>
            <small className="block text-xs text-muted">{ROLE_LABELS[user.role]}</small>
          </span>
          <Button variant="quiet" onClick={logout} size="sm">
            <EpenIcon name="box-arrow-right" />
            <span>Salir</span>
          </Button>
        </div>
      </header>

      <aside
        ref={sidebar}
        id="epen-sidebar"
        aria-label="Navegación principal"
        className={[
          'fixed inset-y-0 left-0 z-40 flex w-[260px] max-w-[85vw] flex-col gap-2 overflow-y-auto border-r border-line bg-[linear-gradient(160deg,#f9fcff,#edf5ff)] px-2.5 pb-5 transition-transform md:sticky md:top-0 md:col-start-1 md:row-span-2 md:row-start-1 md:h-screen md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="-mx-2.5 mb-6 flex h-[86px] items-start gap-3 bg-[linear-gradient(130deg,#064482,#1257a5_72%,#3687d5)] px-8 pt-[18px] text-white">
          <span className="flex h-7 items-end gap-1" aria-hidden="true">
            <i className="block h-[11px] w-1.5 rounded bg-white" />
            <i className="block h-[17px] w-1.5 rounded bg-white" />
            <i className="block h-[23px] w-1.5 rounded bg-white" />
            <i className="block h-7 w-1.5 rounded bg-white" />
          </span>
          <strong className="text-3xl font-bold leading-8 tracking-tight">EPEN</strong>
        </div>
        <nav className="grid gap-5">
          {groups.map(group => (
            <section key={group} className="grid gap-1">
              <h2 className="px-3.5 text-[11px] font-bold uppercase tracking-wider text-[#62758d]">{group}</h2>
              {items.filter(item => item.group === group).map(item => (
                <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setOpen(false)} className={navLinkClass}>
                  <EpenIcon name={item.icon} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </section>
          ))}
        </nav>
      </aside>

      {open && <button type="button" aria-label="Cerrar navegación" onClick={closeMenu} className="fixed inset-0 z-30 bg-navy-strong/40 md:hidden" />}

      <main className="min-w-0 p-4 md:col-start-2 md:row-start-2 md:p-7">
        {loading ? (
          <Panel className="p-6 text-muted" role="status">Cargando datos…</Panel>
        ) : error ? (
          <Notice tone="error" title="No se pudieron cargar los datos" actions={<Button variant="secondary" onClick={() => reload()}>Reintentar</Button>}>
            {error}
          </Notice>
        ) : (
          <Outlet />
        )}
      </main>
      <AssistantDock />
    </div>
  );
}
