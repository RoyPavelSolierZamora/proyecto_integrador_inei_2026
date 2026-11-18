import Panel from '../ui/Panel.jsx';
import { VerticalBars, chartColors, formatPercent } from '../ui/Charts.jsx';

// Indicadores de cada clasificador de la base, en columnas verticales.
// La línea punteada marca el umbral de aprobación vigente como referencia.
function IndicatorCard({ id, title, subtitle, data, loading }) {
  const evaluated = data?.evaluated;
  const threshold = Number.isFinite(data?.threshold) ? data.threshold : undefined;
  const values = [
    { label: 'Exactitud', value: data?.accuracy, color: chartColors.primary, detail: 'vs. humano' },
    { label: 'Aprobación', value: data?.automaticApproval, color: chartColors.positive, detail: 'automática' },
    { label: 'F1 macro', value: data?.macroF1, color: chartColors.neutral, detail: 'por clase' },
  ].map(item => ({
    label: item.label,
    detail: item.detail,
    color: item.color,
    height: loading || !Number.isFinite(item.value) ? 0 : item.value,
    display: loading ? '…' : formatPercent(item.value),
  }));

  return (
    <Panel as="section" aria-labelledby={id} className="grid grid-cols-1 content-start gap-4 p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 id={id} className="text-base font-bold text-ink-strong">{title}</h2>
          <span className="text-xs text-muted">{subtitle}</span>
        </div>
        <span className="shrink-0 text-right text-xs tabular-nums text-muted">{loading ? "Cargando…" : Number.isFinite(evaluated) && evaluated > 0 ? `${evaluated.toLocaleString("es-PE")} casos evaluados` : "Sin muestra humana"}</span>
      </header>

      <VerticalBars
        ariaLabel={`${title}: exactitud, aprobación automática y F1 macro`}
        items={values}
        threshold={threshold}
        thresholdLabel={threshold !== undefined ? `umbral ${formatPercent(threshold)}` : undefined}
      />
    </Panel>
  );
}

export default function WorkspaceIndicators({ indicators, loading }) {
  return (
    <div aria-busy={loading} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <IndicatorCard id="indicadores-clasificador" title="Clasificador automático" subtitle="Decisiones del modelo sobre la base" data={indicators?.r2} loading={loading} />
      <IndicatorCard id="indicadores-ia" title="Asistencia de IA" subtitle="Propuestas del asistente de IA" data={indicators?.r3} loading={loading} />
    </div>
  );
}
