import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { operationalText } from '../utils/operationalText';
import DatasetWorkspaceSelector from '../components/DatasetWorkspaceSelector';
import useDatasetWorkspace from '../hooks/useDatasetWorkspace';
import { useData } from '../state/DataContext';

const formatDate = value => new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
const formatTime = value => new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const sourceLabel = { automatic: 'Clasificador automático', ai: 'Asistente de IA', human: 'Persona' };

function eventSource(event) {
  if (event.source) return event.source;
  const action = String(event.action || '').toLowerCase();
  if (action.includes('automática')) return 'automatic';
  if (action.includes('ia')) return 'ai';
  return 'human';
}

export default function HistoryPage() {
  const { datasets, activeDataset } = useData();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDatasetId = Number(searchParams.get('dataset')) || activeDataset?.id;
  const { selectedDataset, events, loading, error } = useDatasetWorkspace(requestedDatasetId);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 40;
  const rows = useMemo(() => [...events].reverse().filter(event => {
    const matchesSource = source === 'all' || eventSource(event) === source;
    const text = `${event.caseId} ${operationalText(event.action)} ${event.user} ${event.code || ''}`.toLowerCase();
    return matchesSource && text.includes(query.trim().toLowerCase());
  }), [events, query, source]);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const visible = rows.slice((page - 1) * pageSize, page * pageSize);
  const uniqueCases = new Set(events.map(event => event.caseId)).size;
  const humanEvents = events.filter(event => eventSource(event) === 'human').length;

  useEffect(() => setPage(1), [query, source, selectedDataset?.id]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  return <div className="page history-page">
    <div className="page-heading"><div><p className="eyebrow">Auditoría por versión</p><h1>Historial de decisiones</h1><p>Aquí no se codifica nuevamente: se consulta quién decidió, qué hizo y cuándo ocurrió.</p></div></div>
    <DatasetWorkspaceSelector datasets={datasets} selectedId={selectedDataset?.id} onChange={datasetId => setSearchParams({ dataset: String(datasetId) })} noun="auditar" />
    {loading && <div className="notice" role="status">Cargando trazabilidad…</div>}
    {error && <div className="notice notice--error" role="alert">{error}</div>}
    <section className="history-summary" aria-label="Resumen del historial"><article><span>Eventos</span><strong>{events.length}</strong></article><article><span>Registros modificados</span><strong>{uniqueCases}</strong></article><article><span>Acciones humanas</span><strong>{humanEvents}</strong></article></section>
    <section className="filter-bar history-filters" aria-label="Filtros del historial"><label>Buscar<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Registro, código o responsable" /></label><label>Origen<select value={source} onChange={event => setSource(event.target.value)}><option value="all">Todos</option><option value="automatic">Clasificador automático</option><option value="ai">Asistente de IA</option><option value="human">Persona</option></select></label><span className="filter-count">{rows.length} evento{rows.length === 1 ? '' : 's'}</span></section>
    <section className="audit-timeline" aria-label="Línea de tiempo de decisiones">{visible.map((event, index) => {
      const origin = eventSource(event);
      const showDate = index === 0 || formatDate(visible[index - 1].at) !== formatDate(event.at);
      return <div className="audit-entry-wrap" key={event.id}>{showDate && <h2>{formatDate(event.at)}</h2>}<article className={`audit-entry audit-entry--${origin}`}><time dateTime={event.at}>{formatTime(event.at)}</time><span className="audit-entry-dot" aria-hidden="true" /><div className="audit-entry-body"><header><div><span className={`audit-source audit-source--${origin}`}>{sourceLabel[origin]}</span><strong>{operationalText(event.action)}</strong></div><Link to={`/casos/${encodeURIComponent(event.caseId)}?dataset=${selectedDataset?.id}`}>Ver registro</Link></header><p><span className="case-identifier">{event.caseId}</span>{event.code && <> · Código <strong>{event.code}</strong></>}</p><small>Responsable: {event.user}</small></div></article></div>;
    })}{!loading && !visible.length && <p className="empty-state">{query.trim() || source !== 'all' ? 'No hay eventos con esos filtros.' : 'Esta base todavía no tiene decisiones registradas.'}</p>}</section>
    {rows.length > pageSize && <nav className="pagination" aria-label="Páginas del historial"><button className="button button--secondary" type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página <strong>{page}</strong> de <strong>{totalPages}</strong></span><button className="button button--secondary" type="button" disabled={page === totalPages} onClick={() => setPage(value => value + 1)}>Siguiente</button></nav>}
  </div>;
}
