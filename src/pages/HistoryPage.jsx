import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import DatasetWorkspaceSelector from '../components/DatasetWorkspaceSelector';
import PageHeader from '../components/epen/PageHeader';
import { getDatasetHistoryReal } from '../services/dataClient';
import { useData } from '../state/DataContext';
import { operationalText } from '../utils/operationalText';

const PAGE_SIZE = 30;
const sourceLabel = { automatic: 'Automático', ai: 'Asistente IA', human: 'Persona' };
const formatDate = value => new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export default function HistoryPage() {
  const { datasets, activeDataset } = useData();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedId = Number(searchParams.get('dataset')) || activeDataset?.id;
  const selectedDataset = useMemo(() => datasets.find(item => Number(item.id) === Number(requestedId)) || activeDataset || datasets[0] || null, [datasets, activeDataset, requestedId]);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [source, setSource] = useState('all');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ rows: [], total: 0, summary: { events: 0, cases: 0, human: 0 } });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setAppliedQuery(query.trim()), 280);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => setPage(1), [selectedDataset?.id, appliedQuery, source]);

  useEffect(() => {
    if (!selectedDataset?.id) return undefined;
    let current = true;
    setLoading(true); setError('');
    getDatasetHistoryReal(selectedDataset.id, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, query: appliedQuery, source })
      .then(data => { if (current) setResult(data); })
      .catch(cause => { if (current) setError(cause.message || 'No se pudo consultar la auditoría.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [selectedDataset?.id, appliedQuery, source, page]);

  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const chooseDataset = datasetId => setSearchParams({ dataset: String(datasetId) });

  return <div className="page history-page">
    <PageHeader icon="clock-history" title="Auditoría de decisiones" description="Consulta quién decidió, qué cambió y cuándo. Esta pantalla no modifica registros." />
    <DatasetWorkspaceSelector datasets={datasets} selectedId={selectedDataset?.id} onChange={chooseDataset} noun="auditar" />
    <section className="stats-grid" aria-label="Resumen de auditoría">
      <article className="stat"><span>Decisiones registradas</span><strong>{result.summary.events}</strong></article>
      <article className="stat"><span>Registros intervenidos</span><strong>{result.summary.cases}</strong></article>
      <article className="stat"><span>Decisiones humanas</span><strong>{result.summary.human}</strong></article>
    </section>
    <section className="filter-bar history-filters" aria-label="Filtros de auditoría">
      <label>Buscar<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Registro, código o responsable" /></label>
      <label>Origen<select value={source} onChange={event => setSource(event.target.value)}><option value="all">Todos</option><option value="automatic">Automático</option><option value="ai">Asistente IA</option><option value="human">Persona</option></select></label>
      <span className="filter-count">{result.total} resultado{result.total === 1 ? '' : 's'}</span>
    </section>
    {error && <div className="notice notice--error" role="alert">{error}</div>}
    <div className="table-wrap audit-table-wrap" role="region" aria-label="Decisiones auditadas" tabIndex={0}>
      <table className="audit-table">
        <thead><tr><th>Fecha</th><th>Registro</th><th>Origen</th><th>Decisión</th><th>Código</th><th>Responsable</th><th><span className="sr-only">Acción</span></th></tr></thead>
        <tbody>{result.rows.map(event => <tr key={event.id}>
          <td data-label="Fecha"><time dateTime={event.at}>{formatDate(event.at)}</time></td>
          <td data-label="Registro"><strong className="case-identifier">{event.caseId}</strong></td>
          <td data-label="Origen"><span className={`audit-source audit-source--${event.source}`}>{sourceLabel[event.source]}</span></td>
          <td data-label="Decisión">{operationalText(event.action)}</td>
          <td data-label="Código">{event.code || '—'}</td>
          <td data-label="Responsable">{event.user}</td>
          <td data-label="Acción"><Link className="text-link" to={`/casos/${encodeURIComponent(event.caseId)}?dataset=${selectedDataset?.id}`}>Ver registro</Link></td>
        </tr>)}</tbody>
      </table>
      {!loading && !result.rows.length && <p className="empty-state">No hay decisiones con estos filtros.</p>}
      {loading && <p className="empty-state" role="status">Cargando decisiones…</p>}
    </div>
    {result.total > PAGE_SIZE && <nav className="pagination" aria-label="Páginas de auditoría"><button className="button button--secondary" type="button" disabled={page === 1 || loading} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página <strong>{page}</strong> de <strong>{totalPages}</strong></span><button className="button button--secondary" type="button" disabled={page >= totalPages || loading} onClick={() => setPage(value => value + 1)}>Siguiente</button></nav>}
  </div>;
}
