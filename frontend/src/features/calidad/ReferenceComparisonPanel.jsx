import { useEffect, useState } from 'react';
import Panel from '../../shared/ui/Panel.jsx';
import PanelHeading from '../../shared/ui/PanelHeading.jsx';
import { tableClasses as t } from '../../shared/ui/tableClasses.js';
import Stat from '../../shared/ui/Stat.jsx';
import Notice from '../../shared/ui/Notice.jsx';
import { getReferenceComparisonReal, listReferenceDatasetsReal } from '../../shared/api/dataClient.js';

// Tablas compactas: sin ancho mínimo fijo para evitar desplazamiento lateral; los códigos no se cortan.
const TABLE = 'w-full text-left text-xs sm:text-sm';
const HEAD = 'bg-[#f5f8fd] text-muted';
const CELL = 'px-2 py-1.5 align-middle sm:px-3';
const CODE = 'px-2 py-1.5 align-middle font-semibold text-ink-strong sm:px-3';

const percent = value => value === null || value === undefined ? 'Sin muestra' : `${(Number(value) * 100).toFixed(1)} %`;
const interval = range => range ? `${(range.low * 100).toFixed(1)} a ${(range.high * 100).toFixed(1)} %` : '—';
const ORIGIN_LABELS = { ml: 'Clasificador automático', llm: 'Asistente de IA', human: 'Decisiones de personas', pendiente: 'Sin decisión' };
const BAND_ORDER = ['>=0.99', '0.97-0.99', '0.95-0.97', '<0.95', 'sin_puntaje'];

// Comparación de la base seleccionada con la referencia activa. La gestión (importar y activar) está en Bases.
export default function ReferenceComparisonPanel({ datasetId, datasetName, hideSummary = false }) {
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
    setComparison(null);
    setMessage(null);
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
    <Panel className="mx-auto grid w-full max-w-[1050px] content-start gap-3 p-4">
      <PanelHeading
        title="Comparación con la base codificada"
        description="Compara la base que revisas con la referencia activa. Una diferencia indica que no coinciden; no prueba cuál tiene razón."
      />
      {message && <Notice tone="error">{message}</Notice>}

      <section aria-label="Referencia activa" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-[#f8fbff] px-3 py-2">
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
          {!hideSummary && <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat label="Comparados" value={comparison.compared} hint={`${comparison.pending} sin código del sistema`} />
            <Stat label="Coinciden" value={comparison.overall.correct} hint={`Coincidencia ${percent(comparison.overall.accuracy)}`} />
            <Stat label="No coinciden" value={comparison.overall.incorrect} hint={`IC 95 %: ${interval(comparison.overall.interval)}`} />
            <Stat label="Coincidencia" value={percent(comparison.overall.accuracy)} hint={comparison.overall.verified ? 'Sobre casos comparados' : 'Sin casos comparados'} />
          </div>}

          <div className={t.wrap}>
            <table className={`${t.table} md:table-fixed`}>
              <colgroup className="max-md:hidden"><col style={{width: "30%"}} /><col style={{width: "13%"}} /><col style={{width: "11%"}} /><col style={{width: "15%"}} /><col style={{width: "14%"}} /><col style={{width: "17%"}} /></colgroup>
              <thead className={t.head}>
                <tr>
                  <th scope="col" className={`${t.th} md:py-1.5`}>Analista</th>
                  <th scope="col" className={`${t.th} md:py-1.5`}>Comparados</th>
                  <th scope="col" className={`${t.th} md:py-1.5`}>Coinciden</th>
                  <th scope="col" className={`${t.th} md:py-1.5`}>No coinciden</th>
                  <th scope="col" className={`${t.th} md:py-1.5`}>Coincidencia</th>
                  <th scope="col" className={`${t.th} md:py-1.5`}>IC 95 %</th>
                </tr>
              </thead>
              <tbody className={t.body}>
                {analysts.map(([analyst, summary]) => (
                  <tr key={analyst} className={t.row}>
                    <td data-label="Analista" className={`${t.cell} md:py-1.5`}>{analyst}</td>
                    <td data-label="Comparados" className={`${t.cell} md:py-1.5`}>{summary.verified}</td>
                    <td data-label="Coinciden" className={`${t.cell} md:py-1.5`}>{summary.correct}</td>
                    <td data-label="No coinciden" className={`${t.cell} md:py-1.5`}>{summary.incorrect}</td>
                    <td data-label="Coincidencia" className={`${t.cell} md:py-1.5`}>{percent(summary.accuracy)}</td>
                    <td data-label="IC 95 %" className={`${t.cell} md:py-1.5`}>{interval(summary.interval)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!analysts.length && <p className="py-6 text-center text-sm text-muted">La referencia no tiene analistas asignados.</p>}
          </div>

          <details className="group rounded-xl border border-line">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-ink-strong">Ver desgloses por confianza y origen</summary>
            <div className="grid gap-2 p-2">
              <div className="grid gap-2 lg:grid-cols-2">
                <div className="overflow-x-auto rounded-xl border border-line">
                  <table className={TABLE}>
                    <thead className={HEAD}>
                      <tr>
                        <th scope="col" className="px-2 py-1.5 font-semibold sm:px-3">Confianza</th>
                        <th scope="col" className="px-2 py-1.5 font-semibold sm:px-3">Comparados</th>
                        <th scope="col" className="px-2 py-1.5 font-semibold sm:px-3">Coincidencia</th>
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
                <div className="overflow-x-auto rounded-xl border border-line">
                  <table className={TABLE}>
                    <thead className={HEAD}>
                      <tr>
                        <th scope="col" className="px-2 py-1.5 font-semibold sm:px-3">Origen</th>
                        <th scope="col" className="px-2 py-1.5 font-semibold sm:px-3">Comparados</th>
                        <th scope="col" className="px-2 py-1.5 font-semibold sm:px-3">Coincidencia</th>
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
            </div>
          </details>
        </>
      )}
    </Panel>
  );
}
