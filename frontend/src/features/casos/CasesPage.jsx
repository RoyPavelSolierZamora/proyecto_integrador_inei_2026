import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import DatasetWorkspaceSelector from '../../shared/components/DatasetWorkspaceSelector.jsx';
import WorkspaceIndicators from '../../shared/components/WorkspaceIndicators.jsx';
import ContextHelp from '../../shared/ui/ContextHelp.jsx';
import StatusBadge from '../../shared/ui/StatusBadge.jsx';
import PageHeader from '../../shared/ui/PageHeader.jsx';
import Panel from '../../shared/ui/Panel.jsx';
import Button, { buttonClass } from '../../shared/ui/Button.jsx';
import Notice from '../../shared/ui/Notice.jsx';
import Field, { inputClass } from '../../shared/ui/Field.jsx';
import { tableClasses as t } from '../../shared/ui/tableClasses.js';
import useDatasetWorkspace from '../../shared/hooks/useDatasetWorkspace.js';
import { useData } from '../../app/state/DataContext.jsx';

const PAGE_SIZE = 25;
const views = [
  ['atencion', 'Requieren atención'],
  ['todos', 'Todos los registros'],
  ['r2', 'Clasificación automática'],
  ['qwen', 'Procesados con IA'],
  ['humano', 'Revisados por persona'],
];
const originLabel = { r2: 'Clasificación automática', qwen: 'Asistente de IA', humano: 'Persona', pendiente: 'Sin decisión' };

// Origen de la decisión de un caso: clasificación automática, IA, persona o pendiente.
const caseOrigin = item => item.origen_decision || (item.qwen ? 'qwen' : item.estado === 'corregido' ? 'humano' : item.codigo_final ? 'r2' : 'pendiente');

export default function CasesPage() {
  const { datasets, activeDataset } = useData();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDatasetId = Number(searchParams.get('dataset')) || activeDataset?.id;
  const { selectedDataset, cases, indicators, loading, error } = useDatasetWorkspace(requestedDatasetId);
  const [query, setQuery] = useState('');
  const [view, setView] = useState('atencion');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => cases.filter(item => {
    const matchView = view === 'todos'
      || (view === 'atencion' && ['pendiente', 'revision'].includes(item.estado))
      || (view === 'r2' && caseOrigin(item) === 'r2')
      || (view === 'qwen' && caseOrigin(item) === 'qwen')
      || (view === 'humano' && caseOrigin(item) === 'humano');
    const haystack = `${item.id_registro} ${item.p309} ${item.p308}`.toLowerCase();
    return matchView && haystack.includes(query.trim().toLowerCase());
  }), [cases, query, view]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [query, view, cases.length, selectedDataset?.id]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const selectDataset = datasetId => {
    const next = new URLSearchParams(searchParams);
    next.set('dataset', String(datasetId));
    setSearchParams(next);
  };

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        icon="clipboard-check"
        title="Codificación y revisión"
        description="Selecciona una base y revisa sus registros pendientes."
      />

      <DatasetWorkspaceSelector datasets={datasets} selectedId={selectedDataset?.id} onChange={selectDataset} />
      {selectedDataset && <WorkspaceIndicators indicators={indicators} loading={loading} />}
      {location.state?.notice && <Notice tone="success">{location.state.notice}</Notice>}
      {loading && <Notice>Cargando la base seleccionada…</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      <ContextHelp title="¿Qué muestra cada vista?">
        <p>“Requieren atención” reúne pendientes y revisión humana. Las otras vistas muestran todos los registros o los procesados por clasificación automática, IA o una persona, siempre dentro de la base seleccionada.</p>
      </ContextHelp>

      <Panel className="grid grid-cols-1 gap-3 p-4 md:grid-cols-[minmax(0,1fr)_260px_auto] md:items-end">
        <Field id="casos-buscar" label="Buscar">
          <input id="casos-buscar" type="search" className={inputClass} value={query} onChange={event => setQuery(event.target.value)} placeholder="ID, actividad u ocupación" />
        </Field>
        <Field id="casos-vista" label="Vista">
          <select id="casos-vista" className={inputClass} value={view} onChange={event => setView(event.target.value)}>
            {views.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <p aria-live="polite" className="pb-2 text-sm text-muted">{filtered.length} resultado{filtered.length === 1 ? '' : 's'}</p>
      </Panel>

      <div role="region" aria-label="Tabla de registros" tabIndex={0} className={t.wrap}>
        <table className={t.table}>
          <thead className={t.head}>
            <tr>
              <th scope="col" className={t.th}>Registro</th>
              <th scope="col" className={t.th}>Actividad económica (P309)</th>
              <th scope="col" className={t.th}>Origen y responsable</th>
              <th scope="col" className={t.th}>Nivel de confianza</th>
              <th scope="col" className={t.th}>Estado</th>
              <th scope="col" className={t.th}><span className="sr-only">Acción</span></th>
            </tr>
          </thead>
          <tbody className={t.body}>
            {visible.map(item => (
              <tr key={item.id_registro} className={t.row}>
                <td data-label="Registro" className={t.cell}><strong className="break-all text-ink-strong">{item.id_registro}</strong></td>
                <td data-label="Actividad económica (P309)" className={t.cell}>{item.p309 || 'Sin respuesta P309'}</td>
                <td data-label="Origen y responsable" className={t.cell}>
                  <span className="block font-semibold text-ink-strong">{originLabel[caseOrigin(item)] || 'Sin decisión'}</span>
                  <small className="text-xs text-muted">{item.responsable_decision || '—'}</small>
                </td>
                <td data-label="Nivel de confianza" className={t.cell}>{item.confianza_ml ? `${Math.round(item.confianza_ml * 100)} %` : '—'}</td>
                <td data-label="Estado" className={t.cell}><StatusBadge status={item.estado} /></td>
                <td data-label="Acción" className={t.cell}>
                  <Link
                    className={buttonClass({ variant: 'secondary', size: 'sm' })}
                    to={`/casos/${encodeURIComponent(item.id_registro)}?dataset=${selectedDataset?.id}`}
                  >
                    Ver detalle
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !filtered.length && <p className="py-8 text-center text-sm text-muted">No se encontraron registros con esos filtros.</p>}
      </div>

      {filtered.length > 0 && (
        <nav aria-label="Páginas de registros" className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Anterior</Button>
          <span>Página <strong className="text-ink-strong">{page}</strong> de <strong className="text-ink-strong">{totalPages}</strong> · {filtered.length} registros</span>
          <Button variant="secondary" size="sm" disabled={page === totalPages} onClick={() => setPage(value => value + 1)}>Siguiente</Button>
        </nav>
      )}
    </div>
  );
}
