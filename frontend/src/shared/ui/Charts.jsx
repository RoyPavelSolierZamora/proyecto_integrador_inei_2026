// Gráficos sin dependencias externas. Criterios:
// - Cada valor se lee en texto (no depende solo del color).
// - Paleta apta para daltonismo: azul, naranja y gris, sin pares rojo-verde.
// - Las barras horizontales dejan espacio para etiquetas largas.

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

// Barra horizontal con etiqueta, valor y una marca opcional (por ejemplo, un umbral).
export function Meter({ label, value, color = chartColors.primary, marker, markerLabel, detail }) {
  const width = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) * 100 : 0;
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-sm text-ink">{label}</span>
        <strong className="shrink-0 text-sm tabular-nums text-ink-strong">{Number.isFinite(value) ? formatPercent(value) : 'N/D'}</strong>
      </div>
      <div className="relative h-2.5 rounded-full bg-line" role="presentation">
        <span className="absolute inset-y-0 left-0 rounded-full transition-[width]" style={{ width: `${width}%`, background: color }} />
        {Number.isFinite(marker) && (
          <span
            className="absolute -top-1 bottom-[-4px] w-0.5 bg-ink-strong"
            style={{ left: `${Math.max(0, Math.min(1, marker)) * 100}%` }}
            title={markerLabel}
            aria-hidden="true"
          />
        )}
      </div>
      {detail && <small className="text-xs text-muted">{detail}</small>}
    </div>
  );
}

// Barra apilada 100 %: muestra la composición de un total y etiqueta cada segmento.
export function StackedBar({ segments, total, ariaLabel }) {
  const sum = total || segments.reduce((acc, item) => acc + item.value, 0) || 1;
  return (
    <div className="grid gap-3">
      <div role="img" aria-label={ariaLabel} className="flex h-4 overflow-hidden rounded-full bg-line">
        {segments.map(segment => (
          <span
            key={segment.label}
            title={`${segment.label}: ${formatNumber(segment.value)}`}
            style={{ width: `${(segment.value / sum) * 100}%`, background: segment.color }}
          />
        ))}
      </div>
      <ul className="grid gap-2">
        {segments.map(segment => (
          <li key={segment.label} className="flex items-center gap-2 text-sm">
            <span aria-hidden="true" className="size-2.5 flex-none rounded-sm" style={{ background: segment.color }} />
            <span className="min-w-0 text-ink">{segment.label}</span>
            <strong className="ml-auto tabular-nums text-ink-strong">{formatNumber(segment.value)}</strong>
            <span className="w-14 text-right text-xs tabular-nums text-muted">{formatPercent(segment.value / sum)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Anillo con el total al centro y leyenda con cifras.
export function Donut({ segments, total, centerLabel, ariaLabel }) {
  const sum = total || segments.reduce((acc, item) => acc + item.value, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="grid items-center gap-5 sm:grid-cols-[180px_minmax(0,1fr)]">
      <div className="relative mx-auto size-44">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90" role="img" aria-label={ariaLabel}>
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#e7edf5" strokeWidth="14" />
          {segments.map(segment => {
            const length = sum ? (segment.value / sum) * circumference : 0;
            const element = (
              <circle
                key={segment.label}
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth="14"
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
          <strong className="text-2xl font-bold tabular-nums text-ink-strong">{formatNumber(sum)}</strong>
          <span className="text-xs text-muted">{centerLabel}</span>
        </div>
      </div>
      <ul className="grid gap-3">
        {segments.map(segment => (
          <li key={segment.label} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg bg-[#f8fbff] px-3 py-2">
            <span aria-hidden="true" className="size-3 rounded-sm" style={{ background: segment.color }} />
            <span className="min-w-0 text-sm text-ink">{segment.label}</span>
            <span className="text-right">
              <strong className="block text-sm tabular-nums text-ink-strong">{formatNumber(segment.value)}</strong>
              <small className="block text-xs tabular-nums text-muted">{formatPercent(segment.value / (sum || 1))}</small>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
