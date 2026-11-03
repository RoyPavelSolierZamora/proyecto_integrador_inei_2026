import { Link } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../state/AuthContext';
import { useData } from '../state/DataContext';

export default function HomePage() {
  const { user } = useAuth();
  const { cases, metrics, activeDataset } = useData();
  const actionable = cases.filter(item => ['pendiente', 'revision'].includes(item.estado)).slice(0, 4);
  const canCode = ['analista', 'supervisor', 'admin'].includes(user.role);
  const canLoad = ['operador', 'admin'].includes(user.role);

  return (
    <div className="page">
      <div className="page-heading"><div><p className="eyebrow">Resumen operativo</p><h1>Buenos días, {user.name.split(' ')[0]}</h1><p>Base activa: <strong>{activeDataset?.name}</strong> · {activeDataset?.period}.</p></div>{canCode ? <Link className="button button--primary" to="/casos">Continuar codificando</Link> : canLoad ? <Link className="button button--primary" to="/bases">Procesar nueva base</Link> : null}</div>
      <section className="stats-grid" aria-label="Indicadores principales">
        <article className="stat"><span>Pendientes</span><strong>{metrics.pending}</strong><small>Requieren una decisión</small></article>
        <article className="stat"><span>En revisión</span><strong>{metrics.review}</strong><small>Casos derivados</small></article>
        <article className="stat"><span>Resueltos</span><strong>{metrics.confirmed}</strong><small>Confirmados o corregidos</small></article>
      </section>
      <section className="section-block">
        <div className="section-heading"><div><h2>Trabajo reciente</h2><p>Casos pendientes o derivados que requieren atención.</p></div>{canCode && <Link to="/casos" className="text-link">Ver todos</Link>}</div>
        <div className="record-list">
          {actionable.map(item => (
            <article className="record-row" key={item.id_registro}>
              <div><strong>{item.id_registro}</strong><p>{item.p309}</p></div>
              <div className="record-meta"><StatusBadge status={item.estado} />{canCode && <Link to={`/casos/${item.id_registro}`} className="button button--secondary">Abrir</Link>}</div>
            </article>
          ))}
          {!actionable.length && <p className="empty-state">No hay casos que requieran atención.</p>}
        </div>
      </section>
    </div>
  );
}
