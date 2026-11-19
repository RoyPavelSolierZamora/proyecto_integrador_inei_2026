import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import DatasetWorkspaceSelector from '../../shared/components/DatasetWorkspaceSelector.jsx';
import PageHeader from '../../shared/ui/PageHeader.jsx';
import Stat from '../../shared/ui/Stat.jsx';
import Panel from '../../shared/ui/Panel.jsx';
import Button from '../../shared/ui/Button.jsx';
import Notice from '../../shared/ui/Notice.jsx';
import Field, { inputClass } from '../../shared/ui/Field.jsx';
import { tableClasses as t } from '../../shared/ui/tableClasses.js';
import { getDatasetHistoryReal } from '../../shared/api/dataClient.js';
import { useData } from '../../app/state/DataContext.jsx';
import { operationalText } from '../../shared/lib/operationalText.js';

const PAGE_SIZE = 30;
const sourceLabel = { automatic: 'Automático', ai: 'Asistente IA', human: 'Persona', reference: 'Base codificada' };
const sourceTone = {
  automatic: 'bg-brand-soft text-navy',
  ai: 'bg-[#fff4d6] text-[#7a4b00]',
  human: 'bg-[#e4f7ec] text-[#05603a]',
  reference: 'bg-[#eef0ff] text-[#3b3f8c]',
};
const formatDate = value => new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

// Línea de tiempo de decisiones de una base: quién decidió, qué cambió y cuándo. Solo lectura.
export default function HistoryPage() {
  const { datasets, activeDataset } = useData();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedId = Number(searchParams.get('dataset')) || activeDataset?.id;
  const selectedDataset = useMemo(
    () => datasets.find(item => Number(item.id) === Number(requestedId)) || activeDataset || datasets[0] || null,
    [datasets, activeDataset, requestedId],
  );
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
    setLoading(true);
    setError('');
    getDatasetHistoryReal(selectedDataset.id, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, query: appliedQuery, source })
      .then(data => { if (current) setResult(data); })
      .catch(cause => { if (current) setError(cause.message || 'No se pudo consultar la auditoría.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [selectedDataset?.id, appliedQuery, source, page]);

  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const chooseDataset = datasetId => setSearchParams({ dataset: String(datasetId) });

  return (
    <div className="grid grid-cols-1 gap-4">
      <PageHeader
        icon="clock-history"
        title="Auditoría de decisiones"
        description="Consulta quién decidió, qué cambió y cuándo. Esta pantalla no modifica registros."
      />

      <DatasetWorkspaceSelector datasets={datasets} selectedId={selectedDataset?.id} onChange={chooseDataset} noun="auditar" />

      <section aria-label="Resumen de auditoría" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Decisiones registradas" value={result.summary.events} />
        <Stat label="Registros intervenidos" value={result.summary.cases} />
        <Stat label="Decisiones humanas" value={result.summary.human} />
      </section>

      <Panel aria-label="Filtros de auditoría" as="section" className="grid grid-cols-1 gap-3 p-4 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
        <Field id="auditoria-buscar" label="Buscar">
          <input id="auditoria-buscar" type="search" className={inputClass} value={query} onChange={event => setQuery(event.target.value)} placeholder="Registro, código o responsable" />
        </Field>
        <Field id="auditoria-origen" label="Origen">
          <select id="auditoria-origen" className={inputClass} value={source} onChange={event => setSource(event.target.value)}>
            <option value="all">Todos</option>
            <option value="automatic">Automático</option>
            <option value="ai">Asistente IA</option>
            <option value="human">Persona</option>
            <option value="reference">Base codificada</option>
          </select>
        </Field>
        <p className="pb-2 text-sm text-muted">{result.total} resultado{result.total === 1 ? '' : 's'}</p>
      </Panel>

      {error && <Notice tone="error">{error}</Notice>}

      <div role="region" aria-label="Decisiones auditadas" tabIndex={0} className={t.wrap}>
        <table className={t.table}>
          <thead className={t.head}>
            <tr>
              <th scope="col" className={t.th}>Fecha</th>
              <th scope="col" className={t.th}>Registro</th>
              <th scope="col" className={t.th}>Origen</th>
              <th scope="col" className={t.th}>Decisión</th>
              <th scope="col" className={t.th}>Código</th>
              <th scope="col" className={t.th}>Responsable</th>
              <th scope="col" className={t.th}><span className="sr-only">Acción</span></th>
            </tr>
          </thead>
          <tbody className={t.body}>
            {result.rows.map(event => (
              <tr key={event.id} className={t.row}>
                <td data-label="Fecha" className={t.cell}><time dateTime={event.at}>{formatDate(event.at)}</time></td>
                <td data-label="Registro" className={t.cell}><strong className="break-all text-ink-strong">{event.caseId}</strong></td>
                <td data-label="Origen" className={t.cell}>
                  <span className={['w-fit rounded-full px-2.5 py-1 text-xs font-semibold', sourceTone[event.source] || 'bg-line text-muted'].join(' ')}>{sourceLabel[event.source]}</span>
                </td>
                <td data-label="Decisión" className={t.cell}>{operationalText(event.action)}</td>
                <td data-label="Código" className={t.cell}>{event.code || '—'}</td>
                <td data-label="Responsable" className={t.cell}>{event.user}</td>
                <td data-label="Acción" className={t.cell}>
                  <Link className="font-semibold text-brand hover:underline" to={`/casos/${encodeURIComponent(event.caseId)}?dataset=${selectedDataset?.id}`}>Ver registro</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !result.rows.length && <p className="py-8 text-center text-sm text-muted">No hay decisiones con estos filtros.</p>}
        {loading && <p role="status" className="py-8 text-center text-sm text-muted">Cargando decisiones…</p>}
      </div>

      {result.total > PAGE_SIZE && (
        <nav aria-label="Páginas de auditoría" className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <Button variant="secondary" size="sm" disabled={page === 1 || loading} onClick={() => setPage(value => value - 1)}>Anterior</Button>
          <span>Página <strong className="text-ink-strong">{page}</strong> de <strong className="text-ink-strong">{totalPages}</strong></span>
          <Button variant="secondary" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage(value => value + 1)}>Siguiente</Button>
        </nav>
      )}
    </div>
  );
}
