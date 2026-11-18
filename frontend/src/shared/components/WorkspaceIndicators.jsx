const percent = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });
const formatPercent = value => `${percent.format(value * 100)} %`;
const ticks = [100, 80, 60, 40, 20, 0];

function IndicatorChart({ id, title, data, loading }) {
  const metrics = [
    { label: 'Accuracy', value: data?.accuracy },
    { label: 'Aprobación automática', value: data?.automaticApproval },
    { label: 'Macro F1-Score', value: data?.macroF1 },
  ];

  return (
    <section className="panel indicator-card" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <p>Registros evaluados: {loading ? 'Cargando…' : data?.evaluated ?? 'No disponible'}</p>
      <div className="indicator-chart">
        <div className="indicator-grid" aria-hidden="true">
          {ticks.map(tick => <div key={tick}><span>{tick} %</span></div>)}
        </div>
        {metrics.map(({ label, value }) => (
          <div className="indicator-column" key={label}>
            <div className="indicator-track">
              <div className="indicator-bar" style={{ height: `${(value ?? 0) * 100}%` }}>
                <strong>{loading ? 'Cargando…' : Number.isFinite(value) ? formatPercent(value) : 'No disponible'}</strong>
              </div>
            </div>
            <span className="indicator-label">{label}</span>
          </div>
        ))}
      </div>
      {Number.isFinite(data?.threshold) && <p>Umbral de confianza para la aprobación automática: ≥ {formatPercent(data.threshold)}</p>}
    </section>
  );
}

export default function WorkspaceIndicators({ indicators, loading }) {
  return (
    <div className="workspace-indicators" aria-busy={loading}>
      <IndicatorChart id="r2-indicators" title="Clasificador automático" data={indicators?.r2} loading={loading} />
      <IndicatorChart id="r3-indicators" title="Asistencia de IA" data={indicators?.r3} loading={loading} />
    </div>
  );
}
