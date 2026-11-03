import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { ROLE_LABELS } from '../data/demoData';
import { runtimeConfig } from '../services/r3Client';
import { useAuth } from '../state/AuthContext';
import { useData } from '../state/DataContext';

const allItems = [
  { to: '/', label: 'Inicio', end: true, roles: ['operador', 'analista', 'supervisor', 'auditor', 'admin'] },
  { to: '/casos', label: 'Codificación', roles: ['analista', 'supervisor', 'admin'] },
  { to: '/revision', label: 'Revisión', roles: ['supervisor', 'admin'] },
  { to: '/historial', label: 'Historial', roles: ['supervisor', 'auditor', 'admin'] },
  { to: '/metricas', label: 'Métricas', roles: ['supervisor', 'auditor', 'admin'] },
  { to: '/bases', label: 'Bases de datos', roles: ['operador', 'admin'] },
  { to: '/usuarios', label: 'Usuarios', roles: ['admin'] },
  { to: '/sistema', label: 'Estado técnico', roles: ['admin'] },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const { loading, error, reload } = useData();
  const [open, setOpen] = useState(false);
  const items = allItems.filter(item => item.roles.includes(user.role));

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="menu-button" type="button" aria-label="Abrir navegación" aria-expanded={open} onClick={() => setOpen(value => !value)}>Menú</button>
        <div className="brand"><span className="brand-mark">EPEN</span><span><strong>Codificación asistida</strong><small>Proyecto académico no oficial</small></span></div>
        <div className="topbar-user"><span><strong>{user.name}</strong><small>{ROLE_LABELS[user.role]}</small></span><button type="button" className="button button--quiet" onClick={logout}>Salir</button></div>
      </header>
      <aside className={`sidebar ${open ? 'sidebar--open' : ''}`} aria-label="Navegación principal">
        <div className="mode-label">Modo {runtimeConfig.dataMode === 'demo' ? 'demostración' : 'real'}</div>
        <nav>
          {items.map(item => <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'nav-link nav-link--active' : 'nav-link'}>{item.label}</NavLink>)}
        </nav>
      </aside>
      {open && <button className="scrim" type="button" aria-label="Cerrar navegación" onClick={() => setOpen(false)} />}
      <main className="main-content">
        {loading ? <div className="panel loading-panel" role="status">Cargando datos desde PostgreSQL…</div>
          : error ? <div className="notice notice--error" role="alert"><strong>No se pudieron cargar los datos</strong><span>{error}</span><button type="button" className="button button--secondary" onClick={() => reload()}>Reintentar</button></div>
            : <Outlet />}
      </main>
    </div>
  );
}
