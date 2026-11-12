import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import DatasetWorkspaceSelector from '../components/DatasetWorkspaceSelector';
import ContextHelp from '../components/ContextHelp';
import StatusBadge from '../components/StatusBadge';
import useDatasetWorkspace from '../hooks/useDatasetWorkspace';
import { useData } from '../state/DataContext';

export default function CasesPage() {
  const { datasets, activeDataset } = useData();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDatasetId = Number(searchParams.get('dataset')) || activeDataset?.id;
  const { selectedDataset, cases, loading, error } = useDatasetWorkspace(requestedDatasetId);
  const [query, setQuery] = useState('');
  const [view, setView] = useState('atencion');
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const caseOrigin = item => item.origen_decision || (item.qwen ? 'qwen' : item.estado === 'corregido' ? 'humano' : item.codigo_final ? 'r2' : 'pendiente');

  const filtered = useMemo(() => cases.filter(item => {
    const matchView = view === 'todos'
      || (view === 'atencion' && ['pendiente', 'revision'].includes(item.estado))
      || (view === 'r2' && caseOrigin(item) === 'r2')
      || (view === 'qwen' && caseOrigin(item) === 'qwen')
      || (view === 'humano' && caseOrigin(item) === 'humano');
    const haystack = `${item.id_registro} ${item.p309} ${item.p308}`.toLowerCase();
    return matchView && haystack.includes(query.trim().toLowerCase());
  }), [cases, query, view]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => setPage(1), [query, view, cases.length, selectedDataset?.id]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const originLabel = { r2: 'Clasificación automática', qwen: 'Asistente de IA', humano: 'Persona', pendiente: 'Sin decisión' };
  const selectDataset = datasetId => {
    const next = new URLSearchParams(searchParams);
    next.set('dataset', String(datasetId));
    setSearchParams(next);
  };

  return (
    <div className="page">
      <div className="page-heading"><div><p className="eyebrow">Bandeja unificada</p><h1>Codificación y revisión</h1><p>Selecciona una base y revisa sus registros pendientes.</p></div></div>
      <DatasetWorkspaceSelector datasets={datasets} selectedId={selectedDataset?.id} onChange={selectDataset} />
      {loading && <div className="notice" role="status">Cargando la base seleccionada…</div>}
      {error && <div className="notice notice--error" role="alert">{error}</div>}
      <ContextHelp title="¿Qué muestra cada vista?"><p>“Requieren atención” reúne pendientes y revisión humana. Las otras vistas muestran todos los registros o los procesados por clasificación automática, IA o una persona, siempre dentro de la base seleccionada.</p></ContextHelp>
      <section className="filter-bar" aria-label="Filtros de casos">
        <label>Buscar<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="ID, actividad u ocupación" /></label>
        <label>Vista<select value={view} onChange={event => setView(event.target.value)}><option value="atencion">Requieren atención</option><option value="todos">Todos los registros</option><option value="r2">Clasificación automática</option><option value="qwen">Procesados con IA</option><option value="humano">Revisados por persona</option></select></label>
        <span className="filter-count" aria-live="polite">{filtered.length} resultado{filtered.length === 1 ? '' : 's'}</span>
      </section>
      <div className="table-wrap" role="region" aria-label="Tabla de registros" tabIndex={0}>
        <table>
          <thead><tr><th>Registro</th><th>Actividad económica (P309)</th><th>Origen</th><th>Nivel de confianza</th><th>Estado</th><th><span className="sr-only">Acción</span></th></tr></thead>
          <tbody>{visible.map(item => <tr key={item.id_registro}><td data-label="Registro"><strong>{item.id_registro}</strong></td><td data-label="Actividad económica (P309)">{item.p309 || 'Sin respuesta P309'}</td><td data-label="Origen">{originLabel[caseOrigin(item)] || 'Sin decisión'}</td><td data-label="Nivel de confianza">{item.confianza_ml ? `${Math.round(item.confianza_ml * 100)} %` : '—'}</td><td data-label="Estado"><StatusBadge status={item.estado} /></td><td className="table-action-cell" data-label="Acción"><Link className="button button--secondary table-action" to={`/casos/${encodeURIComponent(item.id_registro)}?dataset=${selectedDataset?.id}`}>Ver detalle</Link></td></tr>)}</tbody>
        </table>
        {!loading && !filtered.length && <p className="empty-state">No se encontraron registros con esos filtros.</p>}
        {filtered.length > 0 && <nav className="pagination" aria-label="Páginas de registros"><button className="button button--secondary" type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página <strong>{page}</strong> de <strong>{totalPages}</strong> · {filtered.length} registros</span><button className="button button--secondary" type="button" disabled={page === totalPages} onClick={() => setPage(value => value + 1)}>Siguiente</button></nav>}
      </div>
    </div>
  );
}
