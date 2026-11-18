// Gráficos con estilo sobrio de paneles de análisis (inspirado en Power BI):
// colores planos, líneas de escala suaves, valores directos y sin decoraciones.
// Paleta apta para daltonismo: azul, naranja y gris, sin pares rojo-verde.

export const chartColors = {
  primary: '#0759bb',
  secondary: '#d9731e',
  neutral: '#8a99ad',
  positive: '#2f9e6b',
  faint: '#c9d3e0',
};

const percentFormat = new Intl.NumberFormat('es-PE', { style: 'percent', maximumFractionDigits: 1 });
const numberFormat = new Intl.NumberFormat('es-PE');

export function formatPercent(value) {
  return Number.isFinite(value) ? percentFormat.format(value) : 'Sin muestra';
}

export function formatNumber(value) {
  return numberFormat.format(Number(value || 0));
}

const PLOT_HEIGHT = 'h-52';
const TICKS = [1, 0.5, 0];

// Columnas verticales. items: [{ label, height (0–1), display, color, detail }]
// threshold (0–1): línea de referencia naranja con su etiqueta en el borde derecho.
export function VerticalBars({ items, ariaLabel, threshold, thresholdLabel, axis = true }) {
  const hasThreshold = Number.isFinite(threshold);
  return (
    <figure aria-label={ariaLabel} className="grid min-w-0 gap-2">
      <div className={axis ? 'grid grid-cols-[2.5rem_minmax(0,1fr)] gap-2' : 'grid min-w-0 gap-2'}>
        {axis && (
          <div aria-hidden="true" className={`${PLOT_HEIGHT} flex flex-col justify-between pb-0 text-right text-[11px] leading-none text-muted tabular-nums`}>
            {TICKS.map(tick => <span key={tick}>{Math.round(tick * 100)} %</span>)}
          </div>
        )}

        <div className="grid min-w-0 gap-2">
          <div className={`relative ${PLOT_HEIGHT}`}>
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
              {TICKS.map(tick => (
                <span key={tick} className="absolute inset-x-0 border-t border-[#e6ecf4]" style={{ top: `${(1 - tick) * 100}%` }} />
              ))}
              {hasThreshold && (
                <span className="absolute inset-x-0 border-t-[1.5px] border-dashed border-[#d9731e]" style={{ top: `${(1 - threshold) * 100}%` }}>
                  <span className="absolute right-0 -translate-y-full pb-0.5 text-[11px] font-semibold text-[#a4520f]">{thresholdLabel}</span>
                </span>
              )}
            </div>

            <div className="relative flex h-full items-end gap-4">
              {items.map(item => {
                const height = Number.isFinite(item.height) ? Math.max(0, Math.min(1, item.height)) : 0;
                return (
                  <div key={item.label} className="relative flex h-full min-w-0 flex-1 items-end justify-center">
                    <span
                      className="absolute left-1/2 -translate-x-1/2 -translate-y-1 whitespace-nowrap text-xs font-semibold tabular-nums text-ink-strong"
                      style={{ bottom: `${height * 100}%` }}
                    >
                      {item.display}
                    </span>
                    <div
                      role="img"
                      aria-label={`${item.label}: ${item.display}`}
                      title={item.detail ? `${item.label}: ${item.display} · ${item.detail}` : `${item.label}: ${item.display}`}
                      className="w-full max-w-12 rounded-t-[3px] transition-[height] duration-500"
                      style={{ height: `${height * 100}%`, minHeight: height > 0 ? 2 : 0, background: item.color }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-4">
            {items.map(item => (
              <div key={item.label} className="grid min-w-0 flex-1 justify-items-center gap-0.5 text-center">
                <span className="w-full break-words text-xs font-medium leading-tight text-ink" title={item.label}>{item.label}</span>
                {item.detail && <small className="text-[11px] text-muted">{item.detail}</small>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}

// Anillo de composición con leyenda. Muestra el total al centro.
// segments: [{ label, value, color }]
export function Donut({ segments, total, centerLabel, ariaLabel }) {
  const sum = total || segments.reduce((acc, item) => acc + item.value, 0);
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="grid items-center gap-5 sm:grid-cols-[168px_minmax(0,1fr)]">
      <div className="relative mx-auto size-40">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" role="img" aria-label={ariaLabel}>
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#eef2f7" strokeWidth="12" />
          {segments.map(segment => {
            const length = sum ? (segment.value / sum) * circumference : 0;
            const element = (
              <circle
                key={segment.label}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth="12"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
              >
                <title>{`${segment.label}: ${formatNumber(segment.value)}`}</title>
              </circle>
            );
            offset += length;
            return element;
          })}
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <strong className="text-xl font-bold tabular-nums text-ink-strong">{formatNumber(sum)}</strong>
          <span className="text-[11px] text-muted">{centerLabel}</span>
        </div>
      </div>
      <ul className="grid gap-2">
        {segments.map(segment => (
          <li key={segment.label} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 text-sm">
            <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: segment.color }} />
            <span className="min-w-0 truncate text-ink" title={segment.label}>{segment.label}</span>
            <span className="text-right">
              <strong className="tabular-nums text-ink-strong">{formatNumber(segment.value)}</strong>
              <span className="ml-2 text-xs tabular-nums text-muted">{formatPercent(segment.value / (sum || 1))}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
