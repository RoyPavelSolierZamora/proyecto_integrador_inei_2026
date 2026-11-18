import { useEffect, useState } from 'react';
import Panel from '../../shared/ui/Panel.jsx';
import PanelHeading from '../../shared/ui/PanelHeading.jsx';
import Stat from '../../shared/ui/Stat.jsx';
import Notice from '../../shared/ui/Notice.jsx';
import { getReferenceComparisonReal, listReferenceDatasetsReal } from '../../shared/api/dataClient.js';

// Tablas compactas: sin ancho mínimo fijo para evitar desplazamiento lateral; los códigos no se cortan.
const TABLE = 'w-full text-left text-sm';
const HEAD = 'bg-[#f5f8fd] text-muted';
const CELL = 'px-3 py-2.5 align-middle';
const CODE = 'whitespace-nowrap px-3 py-2.5 align-middle font-semibold text-ink-strong';

const percent = value => value === null || value === undefined ? 'Sin muestra' : `${(Number(value) * 100).toFixed(1)} %`;
const interval = range => range ? `${(range.low * 100).toFixed(1)} a ${(range.high * 100).toFixed(1)} %` : '—';
const ORIGIN_LABELS = { ml: 'Clasificador automático', llm: 'Asistente de IA', human: 'Decisiones de personas', pendiente: 'Sin decisión' };
const BAND_ORDER = ['>=0.99', '0.97-0.99', '0.95-0.97', '<0.95', 'sin_puntaje'];

// Comparación de la base seleccionada con la referencia activa. La gestión (importar y activar) está en Bases.
export default function ReferenceComparisonPanel({ datasetId, datasetName }) {
  const [active, setActive] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listReferenceDatasetsReal()
      .then(data => { if (!cancelled) setActive(data.references.find(item => item.active) || null); })
      .catch(error => { if (!cancelled) setMessage(error.message); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!datasetId || !active) { setComparison(null); return undefined; }
    let cancelled = false;
    setLoading(true);
    getReferenceComparisonReal(datasetId, active.id)
      .then(data => { if (!cancelled) setComparison(data); })
      .catch(error => { if (!cancelled) setMessage(error.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [datasetId, active?.id]);

  const systemTotal = comparison ? comparison.matched + comparison.onlySystem : 0;
  const analysts = comparison ? Object.entries(comparison.byAnalyst).sort((a, b) => b[1].verified - a[1].verified) : [];
  const bands = comparison ? BAND_ORDER.filter(band => comparison.byBand[band]) : [];
  const origins = comparison ? Object.entries(comparison.byOrigin) : [];

  return (
    <Panel className="grid content-start gap-5 p-5">
      <PanelHeading
        title="Comparación con la base codificada"
        description="Compara la base que revisas con la referencia activa. Una diferencia indica que no coinciden; no prueba cuál tiene razón."
      />
      {message && <Notice tone="error">{message}</Notice>}

      <section aria-label="Referencia activa" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-[#f8fbff] px-4 py-3">
        {active ? (
          <>
            <div className="grid gap-0.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Referencia activa</span>
              <strong className="text-sm text-ink-strong">{active.name} · {active.period} · {active.records} registros</strong>
            </div>
            {comparison && <span className="text-sm text-ink"><strong className="text-ink-strong">{comparison.matched}</strong> de {systemTotal} registros de {datasetName || 'esta base'} están en la referencia.</span>}
          </>
        ) : (
          <span className="text-sm text-muted">No hay base codificada activa. Actívala desde Bases → Herramientas avanzadas → Importar un resultado procesado fuera del sistema.</span>
        )}
      </section>

      {active && comparison && comparison.matched === 0 && (
        <Notice tone="error" title="Ninguno de los registros coincide con la referencia activa.">
          Esta base no comparte identificadores con la referencia. Revisa que sea la misma base que codificaste.
        </Notice>
      )}
      {loading && <span className="text-sm text-muted">Comparando…</span>}

      {comparison && active && comparison.matched > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat label="Comparados" value={comparison.compared} hint={`${comparison.pending} sin código del sistema`} />
            <Stat label="Coinciden" value={comparison.overall.correct} hint={`Precisión ${percent(comparison.overall.accuracy)}`} />
            <Stat label="No coinciden" value={comparison.overall.incorrect} hint={`IC 95 %: ${interval(comparison.overall.interval)}`} />
            <Stat label="Precisión" value={percent(comparison.overall.accuracy)} hint={comparison.overall.verified ? 'Sobre casos comparados' : 'Sin casos comparados'} />
          </div>

          <div className="overflow-hidden rounded-xl border border-line">
            <table className={TABLE}>
              <thead className={HEAD}>
                <tr>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Analista</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Comparados</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Coinciden</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">No coinciden</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Precisión</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">IC 95 %</th>
                </tr>
              </thead>
              <tbody>
                {analysts.map(([analyst, summary]) => (
                  <tr key={analyst} className="border-t border-line">
                    <td className={CODE}>{analyst}</td>
                    <td className={CELL}>{summary.verified}</td>
                    <td className={CELL}>{summary.correct}</td>
                    <td className={CELL}>{summary.incorrect}</td>
                    <td className={CELL}>{percent(summary.accuracy)}</td>
                    <td className={CELL}>{interval(summary.interval)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!analysts.length && <p className="py-6 text-center text-sm text-muted">La referencia no tiene analistas asignados.</p>}
          </div>

          <details className="group rounded-xl border border-line">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-ink-strong">Ver por confianza, origen y diferencias</summary>
            <div className="grid gap-5 p-4">
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="overflow-hidden rounded-xl border border-line">
                  <table className={TABLE}>
                    <thead className={HEAD}>
                      <tr>
                        <th scope="col" className="px-3 py-2.5 font-semibold">Confianza</th>
                        <th scope="col" className="px-3 py-2.5 font-semibold">Comparados</th>
                        <th scope="col" className="px-3 py-2.5 font-semibold">Precisión</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bands.map(band => (
                        <tr key={band} className="border-t border-line">
                          <td className={CODE}>{band === 'sin_puntaje' ? 'Sin puntaje' : band}</td>
                          <td className={CELL}>{comparison.byBand[band].verified}</td>
                          <td className={CELL}>{percent(comparison.byBand[band].accuracy)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="overflow-hidden rounded-xl border border-line">
                  <table className={TABLE}>
                    <thead className={HEAD}>
                      <tr>
                        <th scope="col" className="px-3 py-2.5 font-semibold">Origen</th>
                        <th scope="col" className="px-3 py-2.5 font-semibold">Comparados</th>
                        <th scope="col" className="px-3 py-2.5 font-semibold">Precisión</th>
                      </tr>
                    </thead>
                    <tbody>
                      {origins.map(([origin, summary]) => (
                        <tr key={origin} className="border-t border-line">
                          <td className={CELL}>{ORIGIN_LABELS[origin] || origin}</td>
                          <td className={CELL}>{summary.verified}</td>
                          <td className={CELL}>{percent(summary.accuracy)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="overflow-hidden rounded-xl border border-line">
                <table className={TABLE}>
                  <thead className={HEAD}>
                    <tr>
                      <th scope="col" className="px-3 py-2.5 font-semibold">Registro</th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">Actividad (P309)</th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">Sistema</th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">Referencia</th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">Analista</th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">Origen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.discrepancies.slice(0, 50).map(item => (
                      <tr key={item.externalId} className="border-t border-line">
                        <td className={CODE}>{item.externalId}</td>
                        <td className={CELL}>{item.p309}</td>
                        <td className={CODE}>{item.systemCode}</td>
                        <td className={CODE}>{item.referenceCode}</td>
                        <td className={CODE}>{item.analyst}</td>
                        <td className={CELL}>{ORIGIN_LABELS[item.origin] || item.origin}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!comparison.discrepancies.length && <p className="py-6 text-center text-sm text-muted">No hay diferencias en los casos comparados.</p>}
                {comparison.discrepancies.length > 50 && <p className="px-4 py-3 text-xs text-muted">Mostrando 50 de {comparison.discrepancies.length} diferencias.</p>}
              </div>
            </div>
          </details>
        </>
      )}
    </Panel>
  );
}
