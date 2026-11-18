import Panel from '../ui/Panel.jsx';

const percent = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });
const formatPercent = value => `${percent.format(value * 100)} %`;

// Tres barras por clasificador. La altura es proporcional al valor y el número
// siempre aparece como texto, así que no depende solo del color.
function IndicatorChart({ id, title, data, loading }) {
  const metrics = [
    { label: 'Exactitud', value: data?.accuracy },
    { label: 'Aprobación automática', value: data?.automaticApproval },
    { label: 'F1 macro', value: data?.macroF1 },
  ];

  return (
    <Panel as="section" aria-labelledby={id} className="grid gap-3 p-5">
      <h2 id={id} className="text-base font-bold text-ink-strong">{title}</h2>
      <p className="text-sm text-muted">Registros evaluados: {loading ? 'Cargando…' : data?.evaluated ?? 'No disponible'}</p>
      <div className="grid grid-cols-3 gap-3">
        {metrics.map(({ label, value }) => {
          const height = Math.max(4, Math.min(100, (value ?? 0) * 100));
          return (
            <div key={label} className="grid justify-items-center gap-2">
              <div className="relative flex h-32 w-full items-end justify-center rounded-lg bg-[#f5f8fd]">
                <div className="flex w-full items-start justify-center rounded-t-md bg-brand px-1 pt-1.5 transition-[height]" style={{ height: `${height}%` }}>
                  <strong className="text-xs leading-tight text-white">
                    {loading ? '…' : Number.isFinite(value) ? formatPercent(value) : 'N/D'}
                  </strong>
                </div>
              </div>
              <span className="text-center text-xs font-semibold text-muted">{label}</span>
            </div>
          );
        })}
      </div>
      {Number.isFinite(data?.threshold) && (
        <p className="text-sm text-muted">Umbral de confianza para la aprobación automática: ≥ {formatPercent(data.threshold)}</p>
      )}
    </Panel>
  );
}

export default function WorkspaceIndicators({ indicators, loading }) {
  return (
    <div aria-busy={loading} className="grid gap-4 md:grid-cols-2">
      <IndicatorChart id="indicadores-clasificador" title="Clasificador automático" data={indicators?.r2} loading={loading} />
      <IndicatorChart id="indicadores-ia" title="Asistencia de IA" data={indicators?.r3} loading={loading} />
    </div>
  );
}
