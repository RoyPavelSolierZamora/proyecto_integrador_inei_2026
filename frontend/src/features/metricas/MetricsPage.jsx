import { useEffect, useState } from 'react';
import DatasetWorkspaceSelector from '../../shared/components/DatasetWorkspaceSelector.jsx';
import PageHeader from '../../shared/ui/PageHeader.jsx';
import PanelHeading from '../../shared/ui/PanelHeading.jsx';
import Panel from '../../shared/ui/Panel.jsx';
import Button from '../../shared/ui/Button.jsx';
import Notice from '../../shared/ui/Notice.jsx';
import { getDatasetSummaryReal } from '../../shared/api/dataClient.js';
import { useData } from '../../app/state/DataContext.jsx';

const pct = value => value === null || value === undefined ? 'Sin muestra' : `${(Number(value) * 100).toFixed(1)} %`;
const number = value => Number(value || 0).toLocaleString('es-PE');

const barTone = { brand: 'bg-brand', ai: 'bg-[#d99a1e]', human: 'bg-[#2f9e6b]', danger: 'bg-danger' };

// Barra horizontal con etiqueta, cifra y proporción.
function MetricBar({ label, value, total, tone = 'brand' }) {
  const share = total ? Math.min(1, Number(value) / Number(total)) : 0;
  return (
    <div className="grid grid-cols-1 gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="text-ink">{label}</span>
        <strong className="text-ink-strong">{number(value)} · {pct(share)}</strong>
      </div>
      <div aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-line">
        <span className={`block h-full rounded-full ${barTone[tone]}`} style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  );
}

// Columnas verticales para comparar pocas categorías.
function ColumnChart({ rows, total, label }) {
  const max = Math.max(1, ...rows.map(row => Number(row.value) || 0));
  return (
    <div role="img" aria-label={label} className="grid grid-cols-3 gap-3">
      {rows.map(row => (
        <div key={row.label} className="grid justify-items-center gap-1.5 text-center">
          <strong className="text-sm text-ink-strong">{number(row.value)}</strong>
          <div className="flex h-36 w-full items-end rounded-lg bg-[#f5f8fd] px-2 pb-0">
            <span
              className={`block w-full rounded-t-md ${barTone[row.tone || 'brand']}`}
              style={{ height: `${Math.max(row.value ? 3 : 0, (row.value / max) * 100)}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-muted">{row.label}</span>
          <small className="text-xs text-muted">{pct(total ? row.value / total : 0)}</small>
        </div>
      ))}
    </div>
  );
}

// Métricas de una base: operación, calidad de entrada y desempeño evaluado.
// La cobertura y la exactitud se leen juntas; la confianza sola no prueba corrección.
export default function MetricsPage() {
  const { datasets, activeDataset } = useData();
  const [datasetId, setDatasetId] = useState(activeDataset?.id || null);
  const [summary, setSummary] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAllCodes, setShowAllCodes] = useState(false);

  useEffect(() => {
    if (!datasetId) return undefined;
    let current = true;
    setLoading(true);
    setMessage('');
    setSummary(null);
    getDatasetSummaryReal(datasetId)
      .then(data => {
        if (!current) return;
        if (!data?.dataset || !data?.totals || !data?.rates || !data?.totals?.confidenceBands || !Array.isArray(data?.topCodes)) {
          setMessage('El servicio de métricas necesita actualizarse. Reinicia el sistema para cargar la versión actual.');
          return;
        }
        setSummary(data);
      })
      .catch(error => { if (current) setMessage(error.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [datasetId]);

  const t = summary?.totals;
  const r2 = summary?.indicators?.r2;
  const r3 = summary?.indicators?.r3;
  const evaluated = Number(r2?.evaluated || 0);
  const sourceTotal = t ? t.automatic + t.ai + t.human : 0;
  const maxCode = Math.max(1, ...(summary?.topCodes || []).map(row => row.count));
  const visibleCodes = summary?.topCodes?.slice(0, showAllCodes ? 15 : 6) || [];

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader icon="bar-chart" title="Métricas" description="Operación, calidad de datos y desempeño evaluado de una base." />

      <DatasetWorkspaceSelector datasets={datasets} selectedId={datasetId} onChange={setDatasetId} />
      {message && <Notice tone="error">{message}</Notice>}
      {loading && <Notice>Calculando indicadores…</Notice>}

      {summary && (
        <>
          <section aria-label="Indicadores principales" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Registros', value: number(t.total), hint: `${summary.dataset.period} · versión ${summary.dataset.version}` },
              { label: 'Cobertura resuelta', value: pct(summary.rates.resolved), hint: `${number(t.resolved)} con código final` },
              { label: 'Cobertura automática', value: pct(summary.rates.automatic), hint: 'Clasificador e IA sobre el total' },
              { label: 'Necesitan revisión', value: pct(summary.rates.review), hint: `${number(t.review)} registros` },
            ].map(item => (
              <Panel key={item.label} className="grid content-start gap-1 p-5">
                <span className="text-sm font-semibold text-muted">{item.label}</span>
                <strong className="text-3xl font-bold text-ink-strong">{item.value}</strong>
                <small className="text-xs text-muted">{item.hint}</small>
              </Panel>
            ))}
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel className="grid content-start gap-4 p-5">
              <PanelHeading title="Estado del procesamiento" description="Distribución de todos los registros de esta versión." />
              <ColumnChart
                label="Estado de los registros"
                total={t.total}
                rows={[
                  { label: 'Resueltos', value: t.resolved },
                  { label: 'En revisión', value: t.review, tone: 'human' },
                  { label: 'Pendientes', value: t.pending, tone: 'ai' },
                ]}
              />
            </Panel>

            <Panel className="grid content-start gap-4 p-5">
              <PanelHeading title="Cómo se resolvió" description="Origen de la última decisión registrada." />
              <div className="grid grid-cols-1 gap-4">
                <MetricBar label="Clasificador automático" value={t.automatic} total={sourceTotal} />
                <MetricBar label="Asistencia de IA" value={t.ai} total={sourceTotal} tone="ai" />
                <MetricBar label="Codificación humana" value={t.human} total={sourceTotal} tone="human" />
              </div>
              {!sourceTotal && <p className="text-sm text-muted">Todavía no hay decisiones registradas.</p>}
            </Panel>
          </div>

          <Panel className="grid grid-cols-1 gap-4 p-5">
            <PanelHeading title="Calidad de entrada" description="Campos necesarios antes de interpretar el desempeño." />
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { term: 'P309 completo', value: pct(summary.rates.completeness), hint: `${number(t.missingP309)} vacíos` },
                { term: 'Contexto incompleto', value: number(t.missingContext), hint: 'P308 o P308A vacío' },
                { term: 'Clases observadas', value: number(t.uniqueCodes), hint: 'Con código final' },
                { term: 'Concentración top 5', value: pct(summary.rates.topFiveConcentration), hint: 'Participación de 5 códigos' },
              ].map(item => (
                <div key={item.term} className="grid grid-cols-1 gap-0.5 rounded-lg border border-line bg-[#f8fbff] p-4">
                  <dt className="text-xs font-semibold text-muted">{item.term}</dt>
                  <dd className="m-0 text-2xl font-bold text-ink-strong">{item.value}</dd>
                  <small className="text-xs text-muted">{item.hint}</small>
                </div>
              ))}
            </dl>
          </Panel>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel className="grid content-start gap-4 p-5">
              <PanelHeading title="Confianza del clasificador" description="Distribución operativa; no equivale a exactitud." />
              <div className="grid grid-cols-1 gap-4">
                <MetricBar label="0,95 o más" value={t.confidenceBands.high} total={t.total} />
                <MetricBar label="0,90 a 0,94" value={t.confidenceBands.medium} total={t.total} tone="ai" />
                <MetricBar label="Menos de 0,90" value={t.confidenceBands.low} total={t.total} tone="human" />
                {t.confidenceBands.missing > 0 && <MetricBar label="Sin confianza registrada" value={t.confidenceBands.missing} total={t.total} tone="danger" />}
              </div>
            </Panel>

            <Panel className="grid content-start gap-4 p-5">
              <PanelHeading title="Códigos más frecuentes" description="Distribución entre registros resueltos." />
              <div className="grid grid-cols-1 gap-3">
                {visibleCodes.map(row => (
                  <div key={row.code} className="grid grid-cols-1 gap-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-ink" title={row.description}><strong className="text-ink-strong">{row.code}</strong> · {row.description}</span>
                      <strong className="shrink-0 text-ink-strong">{number(row.count)} · {pct(row.share)}</strong>
                    </div>
                    <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-line">
                      <span className="block h-full rounded-full bg-brand" style={{ width: `${(row.count / maxCode) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              {summary.topCodes.length > 6 && (
                <div>
                  <Button variant="quiet" size="sm" onClick={() => setShowAllCodes(value => !value)}>
                    {showAllCodes ? 'Ver menos códigos' : 'Ver hasta 15 códigos'}
                  </Button>
                </div>
              )}
              {!summary.topCodes.length && <p className="text-sm text-muted">Aún no hay códigos finales.</p>}
            </Panel>
          </div>

          <Panel className="grid grid-cols-1 gap-4 p-5">
            <PanelHeading title="Calidad evaluada" description="Solo usa registros que también tienen una decisión humana de referencia." />
            {evaluated ? (
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { term: 'Casos evaluados', value: number(evaluated), hint: 'Tamaño real de la muestra' },
                  { term: 'Exactitud del clasificador', value: pct(r2.accuracy), hint: 'Top 1 frente a humano' },
                  { term: 'F1 macro del clasificador', value: pct(r2.macroF1), hint: 'Da igual peso a cada clase' },
                  { term: 'Exactitud de la IA', value: r3?.evaluated ? pct(r3.accuracy) : 'Sin muestra', hint: `${number(r3?.evaluated)} casos evaluados` },
                ].map(item => (
                  <div key={item.term} className="grid grid-cols-1 gap-0.5 rounded-lg border border-line bg-[#f8fbff] p-4">
                    <dt className="text-xs font-semibold text-muted">{item.term}</dt>
                    <dd className="m-0 text-2xl font-bold text-ink-strong">{item.value}</dd>
                    <small className="text-xs text-muted">{item.hint}</small>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted">
                Aún no existe una muestra humana suficiente. La cobertura describe cuánto automatiza el sistema, pero no permite afirmar qué tan correcto es.
              </p>
            )}
          </Panel>

          <p className="text-sm text-muted">
            Lectura recomendada: cobertura y exactitud deben analizarse juntas. Una confianza alta solo es útil si su calibración se valida en un periodo independiente.
          </p>
        </>
      )}
    </div>
  );
}
