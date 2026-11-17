import { useEffect, useState } from 'react';
import DatasetWorkspaceSelector from '../components/DatasetWorkspaceSelector';
import PageHeader from '../components/epen/PageHeader';
import PanelHeading from '../components/epen/PanelHeading';
import { getDatasetSummaryReal } from '../services/dataClient';
import { useData } from '../state/DataContext';

const pct = value => value === null || value === undefined ? 'Sin muestra' : `${(Number(value) * 100).toFixed(1)} %`;
const number = value => Number(value || 0).toLocaleString('es-PE');

function MetricBar({ label, value, total, tone = 'brand' }) {
  const share = total ? Math.min(1, Number(value) / Number(total)) : 0;
  return <div className="metric-bar"><div><span>{label}</span><strong>{number(value)} · {pct(share)}</strong></div><div aria-hidden="true"><i className={`metric-bar--${tone}`} style={{ width: `${share * 100}%` }} /></div></div>;
}

function ColumnChart({ rows, total, label }) {
  const max = Math.max(1, ...rows.map(row => Number(row.value) || 0));
  return <div className="metrics-column-chart" role="img" aria-label={label}>
    {rows.map(row => <div className="metrics-column" key={row.label}>
      <strong>{number(row.value)}</strong><div className="metrics-column__plot"><span className={`metrics-column__fill metrics-column__fill--${row.tone || 'brand'}`} style={{ height: `${Math.max(row.value ? 3 : 0, row.value / max * 100)}%` }} /></div>
      <span>{row.label}</span><small>{pct(total ? row.value / total : 0)}</small>
    </div>)}
  </div>;
}

export default function MetricsPage() {
  const { datasets, activeDataset } = useData();
  const [datasetId, setDatasetId] = useState(activeDataset?.id || null);
  const [summary, setSummary] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAllCodes, setShowAllCodes] = useState(false);

  useEffect(() => {
    if (!datasetId) return;
    let current = true;
    setLoading(true); setMessage('');
    setSummary(null);
    getDatasetSummaryReal(datasetId).then(data => {
      if (!current) return;
      if (!data?.dataset || !data?.totals || !data?.rates || !data?.totals?.confidenceBands || !Array.isArray(data?.topCodes)) {
        setMessage('El servicio de métricas necesita actualizarse. Reinicia el sistema para cargar la versión actual.');
        return;
      }
      setSummary(data);
    }).catch(error => { if (current) setMessage(error.message); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [datasetId]);

  const t = summary?.totals;
  const r2 = summary?.indicators?.r2;
  const r3 = summary?.indicators?.r3;
  const evaluated = Number(r2?.evaluated || 0);
  const sourceTotal = t ? t.automatic + t.ai + t.human : 0;
  const maxCode = Math.max(1, ...(summary?.topCodes || []).map(row => row.count));

  return <div className="page metrics-page">
    <PageHeader icon="bar-chart" title="Métricas" description="Operación, calidad de datos y desempeño evaluado de una base." />
    <DatasetWorkspaceSelector datasets={datasets} selectedId={datasetId} onChange={setDatasetId} />
    {message && <div className="notice notice--error" role="alert">{message}</div>}
    {loading && <div className="notice" role="status">Calculando indicadores…</div>}

    {summary && <>
      <section className="metric-hero" aria-label="Indicadores principales">
        <article><span>Registros</span><strong>{number(t.total)}</strong><small>{summary.dataset.period} · versión {summary.dataset.version}</small></article>
        <article><span>Cobertura resuelta</span><strong>{pct(summary.rates.resolved)}</strong><small>{number(t.resolved)} con código final</small></article>
        <article><span>Cobertura automática</span><strong>{pct(summary.rates.automatic)}</strong><small>Clasificador e IA sobre el total</small></article>
        <article><span>Necesitan revisión</span><strong>{pct(summary.rates.review)}</strong><small>{number(t.review)} registros</small></article>
      </section>

      <div className="metrics-layout">
        <section className="panel metrics-section">
          <PanelHeading title="Estado del procesamiento" description="Distribución de todos los registros de esta versión." />
          <ColumnChart label="Estado de los registros" total={t.total} rows={[{label:'Resueltos',value:t.resolved},{label:'En revisión',value:t.review,tone:'human'},{label:'Pendientes',value:t.pending,tone:'ai'}]} />
        </section>
        <section className="panel metrics-section">
          <PanelHeading title="Cómo se resolvió" description="Origen de la última decisión registrada." />
          <div className="metric-bars">
            <MetricBar label="Clasificador automático" value={t.automatic} total={sourceTotal} />
            <MetricBar label="Asistencia de IA" value={t.ai} total={sourceTotal} tone="ai" />
            <MetricBar label="Codificación humana" value={t.human} total={sourceTotal} tone="human" />
          </div>
          {!sourceTotal && <p className="empty-state empty-state--compact">Todavía no hay decisiones registradas.</p>}
        </section>

      </div>
      <div className="metrics-layout metrics-layout--single">
        <section className="panel metrics-section">
          <PanelHeading title="Calidad de entrada" description="Campos necesarios antes de interpretar el desempeño." />
          <dl className="metric-facts">
            <div><dt>P309 completo</dt><dd>{pct(summary.rates.completeness)}</dd><small>{number(t.missingP309)} vacíos</small></div>
            <div><dt>Contexto incompleto</dt><dd>{number(t.missingContext)}</dd><small>P308 o P308A vacío</small></div>
            <div><dt>Clases observadas</dt><dd>{number(t.uniqueCodes)}</dd><small>Con código final</small></div>
            <div><dt>Concentración top 5</dt><dd>{pct(summary.rates.topFiveConcentration)}</dd><small>Participación de 5 códigos</small></div>
          </dl>
        </section>
      </div>

      <div className="metrics-layout">
        <section className="panel metrics-section">
          <PanelHeading title="Confianza del clasificador" description="Distribución operativa; no equivale a exactitud." />
          <div className="metric-bars">
            <MetricBar label="0,95 o más" value={t.confidenceBands.high} total={t.total} />
            <MetricBar label="0,90 a 0,94" value={t.confidenceBands.medium} total={t.total} tone="ai" />
            <MetricBar label="Menos de 0,90" value={t.confidenceBands.low} total={t.total} tone="human" />
            {t.confidenceBands.missing > 0 && <MetricBar label="Sin confianza registrada" value={t.confidenceBands.missing} total={t.total} tone="human" />}
          </div>
        </section>

        <section className="panel metrics-section">
          <PanelHeading title="Códigos más frecuentes" description="Distribución entre registros resueltos." />
          <div className="metric-bars metric-code-bars">{summary.topCodes.slice(0, showAllCodes ? 15 : 6).map(row => <div className="code-chart-row" key={row.code}><div className="code-chart-row__heading"><span title={row.description}><strong>{row.code}</strong> · {row.description}</span><strong>{number(row.count)} · {pct(row.share)}</strong></div><div className="code-chart-row__track" aria-hidden="true"><span style={{ width: `${row.count / maxCode * 100}%` }} /></div></div>)}</div>
          {summary.topCodes.length > 6 && <button className="button button--quiet" type="button" onClick={() => setShowAllCodes(value => !value)}>{showAllCodes ? 'Ver menos códigos' : 'Ver hasta 15 códigos'}</button>}
          {!summary.topCodes.length && <p className="empty-state empty-state--compact">Aún no hay códigos finales.</p>}
        </section>
      </div>

      <section className="panel metrics-section model-quality">
        <PanelHeading title="Calidad evaluada" description="Solo usa registros que también tienen una decisión humana de referencia." />
        {evaluated ? <div className="metric-facts metric-facts--quality">
          <div><dt>Casos evaluados</dt><dd>{number(evaluated)}</dd><small>Tamaño real de la muestra</small></div>
          <div><dt>Exactitud R2</dt><dd>{pct(r2.accuracy)}</dd><small>Top 1 frente a humano</small></div>
          <div><dt>F1 macro R2</dt><dd>{pct(r2.macroF1)}</dd><small>Da igual peso a cada clase</small></div>
          <div><dt>Exactitud IA</dt><dd>{r3?.evaluated ? pct(r3.accuracy) : 'Sin muestra'}</dd><small>{number(r3?.evaluated)} casos evaluados</small></div>
        </div> : <p className="metrics-empty-quality">Aún no existe una muestra humana suficiente. La cobertura describe cuánto automatiza el sistema, pero no permite afirmar qué tan correcto es.</p>}
      </section>

      <p className="method-note">Lectura recomendada: cobertura y exactitud deben analizarse juntas. Una confianza alta solo es útil si su calibración se valida en un periodo independiente.</p>
    </>}
  </div>;
}
