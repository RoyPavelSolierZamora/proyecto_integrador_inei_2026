import { useMemo, useState } from 'react';
import { useData } from '../state/DataContext';

const formatDate = value => new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));

export default function HistoryPage() {
  const { events } = useData();
  const [query, setQuery] = useState('');
  const rows = useMemo(() => [...events].reverse().filter(event => `${event.caseId} ${event.action} ${event.user} ${event.code || ''}`.toLowerCase().includes(query.trim().toLowerCase())), [events, query]);
  return (
    <div className="page">
      <div className="page-heading"><div><p className="eyebrow">Trazabilidad</p><h1>Historial de decisiones</h1><p>Cada consulta, confirmación, corrección y derivación queda registrada.</p></div></div>
      <section className="filter-bar"><label>Buscar<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Registro, acción, código o usuario" /></label><span className="filter-count">{rows.length} eventos</span></section>
      <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Registro</th><th>Acción</th><th>Código</th><th>Usuario</th></tr></thead><tbody>{rows.map(event => <tr key={event.id}><td data-label="Fecha">{formatDate(event.at)}</td><td data-label="Registro"><strong>{event.caseId}</strong></td><td data-label="Acción" className="capitalize">{event.action}</td><td data-label="Código">{event.code || '—'}</td><td data-label="Usuario">{event.user}</td></tr>)}</tbody></table></div>
    </div>
  );
}
