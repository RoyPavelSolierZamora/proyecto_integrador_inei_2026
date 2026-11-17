import { useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { ROLE_LABELS } from '../data/roleLabels';
import { useAuth } from '../state/AuthContext';
import { useData } from '../state/DataContext';

import EpenIcon from './epen/EpenIcon';
import AssistantDock from './AssistantDock';
import '../epen-theme.css';

const allItems = [
  { to: '/', label: 'Inicio', icon: 'house-door', end: true, roles: ['operador', 'analista', 'supervisor', 'auditor', 'admin'] },
  { to: '/casos', label: 'Codificación y revisión', icon: 'clipboard-check', roles: ['analista', 'supervisor', 'auditor', 'admin'] },
  { to: '/historial', label: 'Historial', icon: 'clock-history', roles: ['supervisor', 'auditor', 'admin'] },
  { to: '/metricas', label: 'Métricas', icon: 'bar-chart', roles: ['supervisor', 'auditor', 'admin'] },
  { to: '/calidad', label: 'Control de calidad', icon: 'bar-chart', roles: ['supervisor', 'auditor', 'admin'] },
  { to: '/criterios', label: 'Criterios', icon: 'clipboard-check', roles: ['supervisor', 'auditor', 'admin'] },
  { to: '/asistente', label: 'Asistente', icon: 'layers', roles: ['operador', 'analista', 'supervisor', 'auditor', 'admin'] },
  { to: '/bases', label: 'Bases de datos', icon: 'database', roles: ['operador', 'admin'] },
  { to: '/usuarios', label: 'Usuarios', icon: 'people', roles: ['admin'] },
  { to: '/sistema', label: 'Estado técnico', icon: 'gear', roles: ['admin'] },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const { loading, error, reload } = useData();
  const [open, setOpen] = useState(false);
  const menuButton = useRef(null);
  const sidebar = useRef(null);
  const closeMenu = () => { setOpen(false); menuButton.current?.focus(); };
  const items = allItems.filter(item => item.roles.includes(user.role));

  return (
    <div className="app-shell epen-shell" onKeyDown={event => { if (event.key === 'Escape' && open) closeMenu(); }}>
      <header className="topbar">
        <button ref={menuButton} className="menu-button" type="button" aria-label={open ? 'Cerrar navegación' : 'Abrir navegación'} aria-expanded={open} aria-controls="epen-sidebar" onClick={() => { if (open) closeMenu(); else { setOpen(true); requestAnimationFrame(() => sidebar.current?.querySelector('a')?.focus()); } }}><EpenIcon name={open ? 'x-lg' : 'list'} /></button>
        <div className="epen-header-title"><EpenIcon name="layers" /><span className="epen-header-separator" aria-hidden="true" /><div><strong>Sistema de Codificación EPEN</strong><small>Proyecto académico no oficial</small></div></div>
        <div className="topbar-user"><EpenIcon name="person-circle" /><span><strong>{user.name}</strong><small>{ROLE_LABELS[user.role]}</small></span><button type="button" className="button button--quiet" onClick={logout}><EpenIcon name="box-arrow-right" /><span>Salir</span></button></div>
      </header>
      <aside ref={sidebar} id="epen-sidebar" className={`sidebar ${open ? 'sidebar--open' : ''}`} aria-label="Navegación principal">
        <div className="epen-sidebar-brand"><span className="epen-logo-bars" aria-hidden="true"><i /><i /><i /><i /></span><strong>EPEN</strong></div>
        <div className="mode-label">Gestión de codificación</div>
        <nav>
          {items.map(item => <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'nav-link nav-link--active' : 'nav-link'}><EpenIcon name={item.icon} /><span>{item.label}</span></NavLink>)}
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
