import { useEffect, useState } from 'react';
import DatasetWorkspaceSelector from '../../shared/components/DatasetWorkspaceSelector.jsx';
import PageHeader from '../../shared/ui/PageHeader.jsx';
import PanelHeading from '../../shared/ui/PanelHeading.jsx';
import Panel from '../../shared/ui/Panel.jsx';
import Button from '../../shared/ui/Button.jsx';
import Notice from '../../shared/ui/Notice.jsx';
import { Donut, VerticalBars, chartColors, formatNumber, formatPercent } from '../../shared/ui/Charts.jsx';
import { getDatasetSummaryReal } from '../../shared/api/dataClient.js';
import { useData } from '../../app/state/DataContext.jsx';

const pct = value => value === null || value === undefined ? 'Sin muestra' : `${(Number(value) * 100).toFixed(1)} %`;
const number = value => Number(value || 0).toLocaleString('es-PE');

const share = (value, total) => (total ? Math.min(1, Number(value) / Number(total)) : 0);

// Métricas de una base: operación, calidad de entrada y desempeño evaluado.
// La cobertura y la exactitud se leen juntas; la confianza sola no prueba corrección.
export default function MetricsPage() {
  const { datasets, activeDataset } = useData();
  const [datasetId, setDatasetId] = useState(activeDataset?.id || null);
  const [summary, setSummary] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

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
  const codePalette = [chartColors.primary, chartColors.secondary, chartColors.positive, '#5b6b82', '#9fb4cf'];
  const topFive = summary?.topCodes?.slice(0, 5) || [];
  const topFiveTotal = topFive.reduce((acc, row) => acc + row.count, 0);
  const otherCodes = Math.max(0, (t?.resolved || 0) - topFiveTotal);
  const codeSegments = [
    ...topFive.map((row, index) => ({ label: `${row.code} · ${row.description}`, value: row.count, color: codePalette[index] })),
    ...(otherCodes > 0 ? [{ label: 'Otros códigos', value: otherCodes, color: chartColors.faint }] : []),
  ];

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
              <VerticalBars
                ariaLabel="Estado de los registros"
                footnote={`total n = ${formatNumber(t.total)}`}
                items={[
                  { label: 'Resueltos', value: t.resolved, color: chartColors.primary },
                  { label: 'En revisión', value: t.review, color: chartColors.secondary },
                  { label: 'Pendientes', value: t.pending, color: chartColors.neutral },
                ].map(item => ({ label: item.label, color: item.color, height: share(item.value, t.total), display: formatNumber(item.value), detail: formatPercent(share(item.value, t.total)) }))}
              />
            </Panel>

            <Panel className="grid content-start gap-4 p-5">
              <PanelHeading title="Cómo se resolvió" description="Origen de la última decisión registrada." />
              <VerticalBars
                ariaLabel="Origen de las decisiones"
                footnote={`total n = ${formatNumber(sourceTotal)}`}
                items={[
                  { label: 'Clasificador', value: t.automatic, color: chartColors.primary },
                  { label: 'IA', value: t.ai, color: chartColors.secondary },
                  { label: 'Persona', value: t.human, color: chartColors.positive },
                ].map(item => ({ label: item.label, color: item.color, height: share(item.value, sourceTotal), display: formatNumber(item.value), detail: formatPercent(share(item.value, sourceTotal)) }))}
              />
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
              <VerticalBars
                ariaLabel="Distribución de la confianza del clasificador"
                footnote={`total n = ${formatNumber(t.total)}`}
                items={[
                  { label: '≥ 0,95', value: t.confidenceBands.high, color: chartColors.primary },
                  { label: '0,90–0,94', value: t.confidenceBands.medium, color: chartColors.secondary },
                  { label: '< 0,90', value: t.confidenceBands.low, color: chartColors.neutral },
                  ...(t.confidenceBands.missing > 0 ? [{ label: 'Sin dato', value: t.confidenceBands.missing, color: chartColors.neutral }] : []),
                ].map(item => ({ label: item.label, color: item.color, height: share(item.value, t.total), display: formatPercent(share(item.value, t.total)), detail: `${formatNumber(item.value)} reg.` }))}
              />
            </Panel>

            <Panel className="grid content-start gap-4 p-5">
              <PanelHeading title="Códigos más frecuentes" description="Distribución entre registros resueltos." />
              <Donut
                ariaLabel="Códigos más frecuentes"
                centerLabel="resueltos"
                total={t?.resolved || 0}
                segments={codeSegments}
              />
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
