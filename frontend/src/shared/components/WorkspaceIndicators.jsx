import Panel from '../ui/Panel.jsx';
import { chartColors, formatPercent, formatNumber } from '../ui/Charts.jsx';

const SERIES = [
  { key: 'r2', label: 'Clasificador automático', color: chartColors.primary },
  { key: 'r3', label: 'Asistencia de IA', color: chartColors.secondary },
];
const METRICS = [
  { key: 'accuracy', label: 'Accuracy', detail: 'Exactitud' },
  { key: 'macroF1', label: 'Macro F1-score', detail: 'F1 promedio por clase' },
  { key: 'automaticApproval', label: 'Aprobación automática', detail: 'Solo clasificador automático', classifierOnly: true },
];

function HorizontalBar({ label, value, color, loading }) {
  const available = !loading && Number.isFinite(value);
  const display = loading ? 'Cargando…' : formatPercent(value);
  return (
    <div role="img" aria-label={`${label}: ${display}`} title={`${label}: ${display}`} className="grid min-w-0 gap-1.5">
      <strong className="block text-right text-xs font-semibold tabular-nums text-ink-strong" style={{ width: available ? `${Math.max(20, Math.min(100, value * 100))}%` : '100%' }}>{display}</strong>
      <div aria-hidden="true" className="relative h-6 overflow-hidden rounded bg-[#eef2f7]">
        <span className="absolute inset-y-0 left-1/2 border-l border-white" />
        <span className="relative block h-full rounded transition-[width] duration-500" style={{ width: available ? `${Math.max(0, Math.min(1, value)) * 100}%` : 0, minWidth: available && value > 0 ? 2 : 0, background: color }} />
      </div>
    </div>
  );
}

function Scale() {
  return <div aria-hidden="true" className="grid"><div className="flex justify-between text-[10px] text-muted"><span>0 %</span><span>50 %</span><span>100 %</span></div></div>;
}

export default function WorkspaceIndicators({ indicators, loading }) {
  const global = indicators?.global;
  return (
    <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 xl:grid-cols-2" aria-busy={loading}>
      <Panel as="section" aria-labelledby="indicadores-comparativos" className="grid min-w-0 content-start gap-5 p-4 sm:p-5">
        <header className="grid gap-1">
          <h2 id="indicadores-comparativos" className="text-base font-bold text-ink-strong">Comparación del clasificador y la IA</h2>
          <p className="text-xs text-muted">Exactitud y F1 macro frente a la referencia humana. La IA solo propone códigos para revisión.</p>
        </header>
        <ul aria-label="Leyenda del gráfico" className="grid gap-2 text-xs text-ink">
          {SERIES.map(series => (
            <li key={series.key} className="flex items-center gap-2">
              <span aria-hidden="true" className="size-3 shrink-0 rounded-sm" style={{ background: series.color }} />
              <span><strong>{series.label}</strong> · {loading ? 'Cargando…' : `${formatNumber(indicators?.[series.key]?.evaluated)} casos evaluados`}</span>
            </li>
          ))}
        </ul>
        <figure aria-label="Barras verticales comparativas de exactitud, F1 macro y aprobación automática" className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-2">
          <div aria-hidden="true" className="flex h-52 flex-col justify-between text-right text-[10px] leading-none text-muted">
            <span>100 %</span><span>50 %</span><span>0 %</span>
          </div>
          <div className="relative min-w-0">
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-52">
              {[0, 50, 100].map(tick => <span key={tick} className="absolute inset-x-0 border-t border-[#e6ecf4]" style={{ top: `${tick}%` }} />)}
            </div>
            <div className="relative grid grid-cols-3 gap-2 sm:gap-4">
              {METRICS.map(metric => {
                const series = metric.classifierOnly ? SERIES.slice(0, 1) : SERIES;
                return (
                  <div key={metric.key} className="grid min-w-0 content-start gap-2">
                    <div className="flex h-52 items-end justify-center gap-2">
                      {series.map(item => {
                        const value = indicators?.[item.key]?.[metric.key];
                        const available = !loading && Number.isFinite(value);
                        const display = loading ? 'Cargando…' : formatPercent(value);
                        return <div key={item.key} role="img" aria-label={`${metric.label}, ${item.label}: ${display}`} title={`${metric.label} · ${item.label}: ${display}`} className="relative w-full max-w-8 rounded-t-[3px] transition-[height] duration-500" style={{ height: available ? `${Math.max(0, Math.min(1, value)) * 100}%` : 0, minHeight: available ? 2 : 0, background: item.color }}>
                          <strong aria-hidden="true" className="absolute bottom-full left-1/2 -translate-x-1/2 whitespace-nowrap pb-1 text-[10px] font-semibold tabular-nums text-ink-strong sm:text-xs">{available ? display : loading ? '…' : '—'}</strong>
                        </div>;
                      })}
                    </div>
                    <div className="grid gap-1 text-center">
                      <strong className="text-xs leading-tight text-ink-strong">{metric.label}</strong>
                      <span className="text-[10px] leading-tight text-muted">{metric.detail}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </figure>
      </Panel>
      <Panel as="section" aria-labelledby="indicadores-globales" className="grid min-w-0 content-start gap-5 p-4 sm:p-5">
        <header className="grid gap-1">
          <h2 id="indicadores-globales" className="text-base font-bold text-ink-strong">Resultado global de la base seleccionada</h2>
          <p className="text-xs text-muted">Flujo combinado: clasificador automático + sugerencias de IA. Cada registro se evalúa una sola vez.</p>
        </header>
        <div className="grid gap-1 text-xs text-muted" aria-live="polite">
          <strong className="text-sm text-ink-strong">{loading ? 'Cargando…' : `${formatNumber(global?.evaluated)} registros evaluados de ${formatNumber(global?.withReference)} con referencia humana`}</strong>
          <span>Cobertura evaluada: {loading ? '…' : formatPercent(global?.coverage)}</span>
          <span>{formatNumber(global?.withoutPrediction)} sin sugerencia válida · {formatNumber(global?.withoutReference)} sin referencia humana</span>
        </div>
        <figure aria-label="Barras horizontales de exactitud y F1 macro globales" className="grid min-w-0 gap-4">
          <Scale />
          {METRICS.slice(0, 2).map(metric => (
            <div key={metric.key} className="grid gap-2">
              <div className="grid gap-1">
                <strong className="text-xs text-ink-strong">{metric.label}</strong>
                <span className="text-[10px] leading-tight text-muted">{metric.detail}</span>
              </div>
              <HorizontalBar label={`${metric.label} global`} value={global?.[metric.key]} color={chartColors.positive} loading={loading} />
            </div>
          ))}
        </figure>
      </Panel>
    </div>
  );
}
