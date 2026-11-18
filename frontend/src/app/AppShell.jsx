import { useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { ROLE_LABELS } from '../shared/lib/roleLabels.js';
import { useAuth } from './state/AuthContext.jsx';
import { useData } from './state/DataContext.jsx';

import EpenIcon from '../shared/ui/EpenIcon.jsx';
import AssistantDock from '../features/asistente/AssistantDock.jsx';
import '../shared/styles/epen-theme.css';

const allItems = [
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

export default function AppShell() {
  const { user, logout } = useAuth();
  const { loading, error, reload } = useData();
  const [open, setOpen] = useState(false);
  const menuButton = useRef(null);
  const sidebar = useRef(null);
  const closeMenu = () => { setOpen(false); menuButton.current?.focus(); };
  const items = allItems.filter(item => item.roles.includes(user.role));
  const groups = [...new Set(items.map(item => item.group))];

  return (
    <div className="app-shell epen-shell" onKeyDown={event => { if (event.key === 'Escape' && open) closeMenu(); }}>
      <header className="topbar">
        <button ref={menuButton} className="menu-button" type="button" aria-label={open ? 'Cerrar navegación' : 'Abrir navegación'} aria-expanded={open} aria-controls="epen-sidebar" onClick={() => { if (open) closeMenu(); else { setOpen(true); requestAnimationFrame(() => sidebar.current?.querySelector('a')?.focus()); } }}><EpenIcon name={open ? 'x-lg' : 'list'} /></button>
        <div className="epen-header-title"><EpenIcon name="layers" /><span className="epen-header-separator" aria-hidden="true" /><div><strong>Codificación EPEN</strong><small>Entorno de trabajo</small></div></div>
        <div className="topbar-user"><EpenIcon name="person-circle" /><span><strong>{user.name}</strong><small>{ROLE_LABELS[user.role]}</small></span><button type="button" className="button button--quiet" onClick={logout}><EpenIcon name="box-arrow-right" /><span>Salir</span></button></div>
      </header>
      <aside ref={sidebar} id="epen-sidebar" className={`sidebar ${open ? 'sidebar--open' : ''}`} aria-label="Navegación principal">
        <div className="epen-sidebar-brand"><span className="epen-logo-bars" aria-hidden="true"><i /><i /><i /><i /></span><strong>EPEN</strong></div>
        <nav>
          {groups.map(group => <section className="nav-group" key={group}><h2>{group}</h2>{items.filter(item => item.group === group).map(item => <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'nav-link nav-link--active' : 'nav-link'}><EpenIcon name={item.icon} /><span>{item.label}</span></NavLink>)}</section>)}
        </nav>
      </aside>
      {open && <button className="scrim" type="button" aria-label="Cerrar navegación" onClick={closeMenu} />}
      <main className="main-content">
        {loading ? <div className="panel loading-panel" role="status">Cargando datos…</div>
          : error ? <div className="notice notice--error" role="alert"><strong>No se pudieron cargar los datos</strong><span>{error}</span><button type="button" className="button button--secondary" onClick={() => reload()}>Reintentar</button></div>
            : <Outlet />}
      </main>
      <AssistantDock />
    </div>
  );
}
