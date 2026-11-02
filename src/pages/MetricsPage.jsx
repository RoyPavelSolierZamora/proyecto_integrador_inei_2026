import { useData } from '../state/DataContext';

const pct = value => `${Math.round(value * 100)} %`;

export default function MetricsPage() {
  const { metrics, cases, activeDataset } = useData();
  const statuses = [
    ['Resueltos', metrics.confirmed, 'var(--success)'],
    ['En revisión', metrics.review, 'var(--warning)'],
    ['Pendientes', metrics.pending, 'var(--brand)'],
  ];
  return (
    <div className="page">
      <div className="page-heading"><div><p className="eyebrow">Seguimiento</p><h1>Métricas operativas</h1><p>Resultados de {activeDataset?.name} · {activeDataset?.period}.</p></div></div>
      <section className="stats-grid"><article className="stat"><span>Cobertura resuelta</span><strong>{pct(metrics.coverage)}</strong><small>{metrics.confirmed} de {metrics.total} registros</small></article><article className="stat"><span>Tasa de derivación</span><strong>{pct(metrics.reviewRate)}</strong><small>{metrics.review} casos en revisión</small></article><article className="stat"><span>Latencia Qwen</span><strong>{metrics.avgLatency ? `${metrics.avgLatency.toFixed(1)} s` : '—'}</strong><small>Promedio de consultas registradas</small></article></section>
      <section className="panel metrics-panel"><div className="panel-heading"><div><p className="eyebrow">Distribución actual</p><h2>Estado de los registros</h2></div><span>{cases.length} registros</span></div><div className="bar-list">{statuses.map(([label, value, color]) => <div className="bar-row" key={label}><div><span>{label}</span><strong>{value}</strong></div><div className="bar-track"><span style={{ width: metrics.total ? `${value / metrics.total * 100}%` : 0, background: color }} /></div></div>)}</div></section>
      <p className="method-note">Estas métricas no representan desempeño productivo. La exactitud final deberá calcularse con P309 reales, candidatos de R2 y un conjunto de prueba independiente.</p>
    </div>
  );
}
