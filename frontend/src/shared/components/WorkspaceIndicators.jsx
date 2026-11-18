import Panel from '../ui/Panel.jsx';
import { Meter, chartColors } from '../ui/Charts.jsx';

// Indicadores de cada clasificador de la base. Cada barra muestra la cifra en texto;
// la marca vertical en "aprobación automática" indica el umbral vigente como referencia.
function IndicatorCard({ id, title, subtitle, data, loading }) {
  const evaluated = data?.evaluated;
  const threshold = Number.isFinite(data?.threshold) ? data.threshold : undefined;

  return (
    <Panel as="section" aria-labelledby={id} className="grid grid-cols-1 content-start gap-5 p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 id={id} className="text-base font-bold text-ink-strong">{title}</h2>
          <span className="text-xs text-muted">{subtitle}</span>
        </div>
        <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold tabular-nums text-navy">
          {loading ? 'Cargando…' : Number.isFinite(evaluated) ? `${evaluated.toLocaleString('es-PE')} evaluados` : 'Sin evaluación'}
        </span>
      </header>

      <div className="grid grid-cols-1 gap-4">
        <Meter label="Exactitud" value={loading ? undefined : data?.accuracy} color={chartColors.primary} detail="Porcentaje de códigos que coinciden con la decisión humana." />
        <Meter
          label="Aprobación automática"
          value={loading ? undefined : data?.automaticApproval}
          color={chartColors.positive}
          marker={threshold}
          markerLabel={threshold !== undefined ? `Umbral ${(threshold * 100).toFixed(0)} %` : undefined}
          detail={threshold !== undefined ? `Umbral de aprobación: ${(threshold * 100).toFixed(0)} %` : 'Sin umbral registrado'}
        />
        <Meter label="F1 macro" value={loading ? undefined : data?.macroF1} color={chartColors.neutral} detail="Equilibra todas las clases, también las poco frecuentes." />
      </div>
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
