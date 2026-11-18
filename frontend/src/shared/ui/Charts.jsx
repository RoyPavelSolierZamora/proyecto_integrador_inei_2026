// Gráficos de barras verticales, sin dependencias externas.
// - Cada columna muestra su valor en texto encima; el color no es el único canal.
// - Escala con líneas de referencia para leer la altura con precisión.
// - Paleta apta para daltonismo: azul, naranja y gris, sin pares rojo-verde.

export const chartColors = {
  primary: '#0759bb',
  secondary: '#d9731e',
  neutral: '#8a99ad',
  positive: '#2f9e6b',
};

const percentFormat = new Intl.NumberFormat('es-PE', { style: 'percent', maximumFractionDigits: 1 });
const numberFormat = new Intl.NumberFormat('es-PE');

export function formatPercent(value) {
  return Number.isFinite(value) ? percentFormat.format(value) : 'Sin muestra';
}

export function formatNumber(value) {
  return numberFormat.format(Number(value || 0));
}

const PLOT_HEIGHT = 'h-56';
const TICKS = [1, 0.75, 0.5, 0.25, 0];

// Gráfico de columnas verticales.
// items: [{ label, height (0–1), display, color, detail }]
// threshold (0–1) dibuja una línea de referencia punteada con su etiqueta.
export function VerticalBars({ items, ariaLabel, threshold, thresholdLabel, footnote, axis = true }) {
  const hasThreshold = Number.isFinite(threshold);
  return (
    <figure aria-label={ariaLabel} className="grid gap-2">
      <div className={axis ? "grid grid-cols-[2.25rem_minmax(0,1fr)] gap-2" : "grid grid-cols-1 gap-2"}>
        {axis && (
        <div aria-hidden="true" className={`${PLOT_HEIGHT} flex flex-col justify-between text-right font-mono text-[11px] leading-none tabular-nums text-muted`}>
          {TICKS.map(tick => <span key={tick}>{Math.round(tick * 100)}</span>)}
        </div>
        )}

        <div className="grid gap-2">
          <div className={`relative ${PLOT_HEIGHT}`}>
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
              {TICKS.map(tick => (
                <span key={tick} className="absolute inset-x-0 border-t border-dashed border-[#d6e0ec]" style={{ top: `${(1 - tick) * 100}%` }} />
              ))}
              {hasThreshold && (
                <span className="absolute inset-x-0 border-t-2 border-dotted border-ink-strong" style={{ top: `${(1 - threshold) * 100}%` }}>
                  <span className="absolute right-0 -translate-y-full rounded bg-ink-strong px-1.5 py-0.5 font-mono text-[10px] leading-none text-white">{thresholdLabel}</span>
                </span>
              )}
            </div>

            <div className="relative flex h-full items-end gap-3">
              {items.map(item => {
                const height = Number.isFinite(item.height) ? Math.max(0, Math.min(1, item.height)) : 0;
                return (
                  <div key={item.label} className="relative flex h-full min-w-0 flex-1 items-end justify-center">
                    <span
                      className="absolute left-1/2 -translate-x-1/2 -translate-y-1 whitespace-nowrap rounded bg-white/90 px-1 font-mono text-xs font-semibold tabular-nums text-ink-strong"
                      style={{ bottom: `${height * 100}%` }}
                    >
                      {item.display}
                    </span>
                    <div
                      role="img"
                      aria-label={`${item.label}: ${item.display}`}
                      title={item.detail ? `${item.label}: ${item.display} · ${item.detail}` : `${item.label}: ${item.display}`}
                      className="w-full max-w-[56px] rounded-t-md shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition-[height] duration-500"
                      style={{
                        height: `${height * 100}%`,
                        minHeight: height > 0 ? 3 : 0,
                        background: `linear-gradient(180deg, ${item.color} 0%, ${item.color}b3 100%)`,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3">
            {items.map(item => (
              <div key={item.label} className="grid min-w-0 flex-1 justify-items-center gap-0.5 text-center">
                <span className="w-full break-words text-center text-xs font-semibold leading-tight text-ink" title={item.label}>{item.label}</span>
                {item.detail && <small className="font-mono text-[11px] text-muted">{item.detail}</small>}
              </div>
            ))}
          </div>
        </div>
      </div>
      {footnote && <figcaption className="font-mono text-[11px] text-muted">{footnote}</figcaption>}
    </figure>
  );
}
