import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../../app/state/DataContext.jsx';
import DatasetWorkspaceSelector from '../../shared/components/DatasetWorkspaceSelector.jsx';
import PageHeader from '../../shared/ui/PageHeader.jsx';
import Notice from '../../shared/ui/Notice.jsx';
import { getCodingDashboardReal, getDatasetSummaryReal } from '../../shared/api/dataClient.js';
import CodingDashboard from './CodingDashboard.jsx';
import OperationalMetrics from './OperationalMetrics.jsx';
import QualityPage from '../calidad/QualityPage.jsx';
import SummaryCards from './SummaryCards.jsx';

const TABS = [
  ['resumen', 'Resumen'],
  ['desempeno', 'Desempeño'],
  ['comparaciones', 'Comparaciones'],
  ['complementario', 'Análisis complementario'],
];

export default function MetricsPage() {
  const { datasets, activeDataset } = useData();
  const [params, setParams] = useSearchParams();
  const requested = params.get('datasetId') || params.get('dataset');
  const datasetId = datasets.find(item => String(item.id) === requested)?.id || activeDataset?.id || null;
  const view = TABS.some(([id]) => id === params.get('vista')) ? params.get('vista') : 'resumen';

  function change(name, value) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      next.set(name, value);
      return next;
    });
  }

  function navigateTabs(event, index) {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    if (event.key === 'ArrowLeft') next = (index + TABS.length - 1) % TABS.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = TABS.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    change('vista', TABS[next][0]);
    document.getElementById(`tab-${TABS[next][0]}`)?.focus();
  }

  return (
    <div className="grid min-w-0 gap-4">
      <PageHeader dense icon="bar-chart" title="Métricas y calidad" description="Seguimiento de la codificación, evaluación de resultados y verificación de calidad." />
      <DatasetWorkspaceSelector datasets={datasets} selectedId={datasetId} onChange={id => change('datasetId', id)} />
      <div role="tablist" aria-label="Apartados de métricas y calidad" className="flex flex-wrap gap-1 rounded-xl border border-line bg-white p-1.5">
        {TABS.map(([id, label], index) => (
          <button
            key={id}
            id={`tab-${id}`}
            type="button"
            role="tab"
            aria-selected={view === id}
            aria-controls="metrics-panel"
            tabIndex={view === id ? 0 : -1}
            className={[
              'min-h-11 cursor-pointer appearance-none border-0 rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
              view === id ? 'bg-brand text-white shadow-sm' : 'bg-transparent text-ink hover:bg-brand-soft',
            ].join(' ')}
            onClick={() => change('vista', id)}
            onKeyDown={event => navigateTabs(event, index)}
          >
            {label}
          </button>
        ))}
      </div>
      {datasetId
        ? <Workspace key={datasetId} datasetId={datasetId} view={view} />
        : <Notice>Selecciona una base de datos para consultar sus resultados.</Notice>}
    </div>
  );
}

// One dataset workspace owns the read requests. Tab changes preserve local controls and
// the blind queue; a dataset change remounts it, so old responses cannot replace new data.
function Workspace({ datasetId, view }) {
  const [summary, setSummary] = useState(null);
  const [coding, setCoding] = useState(null);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const capture = error => {
      if (active) setErrors(list => [...list, error.message]);
    };
    Promise.allSettled([
      getDatasetSummaryReal(datasetId).then(data => {
        if (!data?.dataset || !data?.totals?.confidenceBands || !Array.isArray(data.topCodes) || !data.rates) {
          throw new Error('El servicio devolvió indicadores incompletos.');
        }
        if (active) setSummary(data);
      }).catch(capture),
      getCodingDashboardReal(datasetId).then(data => {
        if (active) setCoding(data);
      }).catch(capture),
    ]).then(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [datasetId]);

  return (
    <section id="metrics-panel" role="tabpanel" aria-labelledby={`tab-${view}`} tabIndex={0}>
      <div className="grid gap-4">
        {(loading || errors.length > 0) && (
          <div aria-live="polite">
            {loading && <Notice>Calculando indicadores…</Notice>}
            {errors.map((message, index) => <Notice key={index} tone="error">{message}</Notice>)}
          </div>
        )}
        {summary?.indicators?.reference?.hasActiveReference && summary.indicators.reference.matched === 0 && (
          <Notice>La base no comparte identificadores con la referencia activa. No se puede calcular la coincidencia.</Notice>
        )}
        {['resumen', 'desempeno', 'comparaciones', 'complementario'].map(id => (
          <div key={id} hidden={view !== id}>
            <div className="grid min-w-0 gap-4">
              {id === 'desempeno' && summary && <OperationalMetrics summary={summary} view={id} hasCoding={Boolean(coding?.coderSectionVisible)} />}
              {id === 'resumen' && summary && <SummaryCards summary={summary} coding={coding} />}
              {id !== 'resumen' && id !== 'complementario' && coding && <CodingDashboard data={coding} view={id} summary={summary} />}
              {summary && id !== 'comparaciones' && id !== 'desempeno' && (
                <OperationalMetrics summary={summary} view={id} hasCoding={Boolean(coding?.coderSectionVisible)} />
              )}
            </div>
          </div>
        ))}
        <QualityPage datasetId={datasetId} view={view} hasCoding={Boolean(coding?.referenceVisible)} />
      </div>
    </section>
  );
}
