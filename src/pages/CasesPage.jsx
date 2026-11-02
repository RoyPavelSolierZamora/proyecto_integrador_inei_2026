import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import { useData } from '../state/DataContext';

export default function CasesPage() {
  const { cases, activeDataset } = useData();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('todos');

  const filtered = useMemo(() => cases.filter(item => {
    const matchStatus = status === 'todos' || item.estado === status;
    const haystack = `${item.id_registro} ${item.p309} ${item.p308}`.toLowerCase();
    return matchStatus && haystack.includes(query.trim().toLowerCase());
  }), [cases, query, status]);

  return (
    <div className="page">
      <div className="page-heading"><div><p className="eyebrow">Bandeja de trabajo</p><h1>Codificación</h1><p>Base activa: <strong>{activeDataset?.name}</strong> · {activeDataset?.period}. Busca un registro y abre su detalle para tomar una decisión.</p></div></div>
      <section className="filter-bar" aria-label="Filtros de casos">
        <label>Buscar<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="ID, actividad u ocupación" /></label>
        <label>Estado<select value={status} onChange={event => setStatus(event.target.value)}><option value="todos">Todos</option><option value="pendiente">Pendientes</option><option value="revision">Revisión humana</option><option value="confirmado">Confirmados</option><option value="corregido">Corregidos</option></select></label>
        <span className="filter-count" aria-live="polite">{filtered.length} resultado{filtered.length === 1 ? '' : 's'}</span>
      </section>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Registro</th><th>Respuesta P309</th><th>Confianza R2</th><th>Estado</th><th><span className="sr-only">Acción</span></th></tr></thead>
          <tbody>{filtered.map(item => <tr key={item.id_registro}><td data-label="Registro"><strong>{item.id_registro}</strong></td><td data-label="Respuesta P309">{item.p309}</td><td data-label="Confianza R2">{Math.round(item.confianza_ml * 100)} %</td><td data-label="Estado"><StatusBadge status={item.estado} /></td><td><Link className="button button--secondary" to={`/casos/${item.id_registro}`}>Revisar</Link></td></tr>)}</tbody>
        </table>
        {!filtered.length && <p className="empty-state">No se encontraron registros con esos filtros.</p>}
      </div>
    </div>
  );
}
