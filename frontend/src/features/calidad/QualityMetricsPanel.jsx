import { useEffect, useState } from 'react';
import Panel from '../../shared/ui/Panel.jsx';
import PanelHeading from '../../shared/ui/PanelHeading.jsx';
import Stat from '../../shared/ui/Stat.jsx';
import Notice from '../../shared/ui/Notice.jsx';
import { tableClasses as t } from '../../shared/ui/tableClasses.js';
import { getQualityMetricsReal } from '../../shared/api/dataClient.js';

const SOURCE_LABELS = { ml: 'Clasificador automático', llm: 'Asistente de IA', human: 'Decisiones de personas' };
const percent = value => value === null || value === undefined ? 'Sin muestra' : `${(Number(value) * 100).toFixed(1)} %`;
const interval = range => range ? `${(range.low * 100).toFixed(1)} a ${(range.high * 100).toFixed(1)} %` : '—';

// Precisión verificada por origen y banda de confianza. Cada cifra trae su intervalo de Wilson al 95 %:
// con pocas verificaciones el intervalo es amplio y no conviene decidir sobre esa cifra.
export default function QualityMetricsPanel({ datasetId, refreshKey = 0 }) {
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!datasetId) return;
    let active = true;
    setLoading(true);
    setError('');
    setMetrics(null);
    getQualityMetricsReal(datasetId)
      .then(data => { if (active) setMetrics(data); })
      .catch(cause => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [datasetId, refreshKey]);

  const overall = metrics?.overall;

  return (
    <Panel className="grid content-start gap-4 p-5">
      <PanelHeading title="Precisión verificada" description="Solo cuentan las verificaciones registradas. No son la precisión total de la base." />
      {error && <Notice tone="error">{error}</Notice>}
      {loading && <Notice>Calculando precisión…</Notice>}

      {overall && (
        <section aria-label="Resumen de precisión verificada" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label="Verificados" value={overall.verified} hint={`${overall.reviewed} revisiones; ${overall.uncertain} no clasificables`} />
          <Stat label="Precisión" value={percent(overall.accuracy)} hint={`Intervalo 95 %: ${interval(overall.interval)}`} />
          <Stat label="Errores encontrados" value={overall.incorrect} hint="Verificaciones con código distinto" />
        </section>
      )}

      {metrics && (
        <div role="region" aria-label="Precisión por origen y banda de confianza" tabIndex={0} className={t.wrap}>
          <table className={t.table}>
            <thead className={t.head}>
              <tr>
                <th scope="col" className={t.th}>Origen</th>
                <th scope="col" className={t.th}>Confianza</th>
                <th scope="col" className={t.th}>Verificados</th>
                <th scope="col" className={t.th}>Correctos</th>
                <th scope="col" className={t.th}>Precisión</th>
                <th scope="col" className={t.th}>Intervalo 95 %</th>
              </tr>
            </thead>
            <tbody className={t.body}>
              {metrics.groups.map(group => (
                <tr key={group.source + group.band} className={t.row}>
                  <td data-label="Origen" className={t.cell}>{SOURCE_LABELS[group.source] || group.source}</td>
                  <td data-label="Confianza" className={t.cell}>{group.band === 'sin_puntaje' ? 'Sin puntaje' : group.band}</td>
                  <td data-label="Verificados" className={t.cell}>{group.verified}</td>
                  <td data-label="Correctos" className={t.cell}>{group.correct}</td>
                  <td data-label="Precisión" className={t.cell}>{percent(group.accuracy)}</td>
                  <td data-label="Intervalo 95 %" className={t.cell}>{interval(group.interval)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!metrics.groups.length && <p className="py-8 text-center text-sm text-muted">Todavía no hay verificaciones registradas en esta base.</p>}
        </div>
      )}

      {metrics && <p className="text-xs text-muted">{metrics.note}</p>}
    </Panel>
  );
}
