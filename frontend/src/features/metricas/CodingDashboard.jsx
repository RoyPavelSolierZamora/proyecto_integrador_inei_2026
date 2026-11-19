import { useEffect, useState } from 'react';
import { Ranking, AnalystColumns } from './QualityCharts.jsx';
import Panel from '../../shared/ui/Panel.jsx';
import Notice from '../../shared/ui/Notice.jsx';
import { tableClasses as t } from '../../shared/ui/tableClasses.js';
import { getCodingDashboardReal } from '../../shared/api/dataClient.js';

// Paleta categórica validada (scripts/validate_palette.js): CVD ΔE 8.7, contraste >= 3:1 sobre la superficie.
// Cada categoría conserva su color según su orden de llegada, nunca según su posición en la tabla.
const CATEGORY = ['#0759bb', '#d9731e', '#2f9e6b', '#7b4fb5', '#b3261e'];
const PRIMARY = CATEGORY[0];
const BAND_ORDER = ['>=0.99', '0.97-0.99', '0.95-0.97', '<0.95', 'sin_puntaje'];
const BAND_LABEL = { '>=0.99': '≥ 0,99', '0.97-0.99': '0,97–0,99', '0.95-0.97': '0,95–0,97', '<0.95': '< 0,95', sin_puntaje: 'Sin puntaje' };
const ORIGIN_LABEL = { ml: 'Clasificador', llm: 'Asistente IA', human: 'Personas', pendiente: 'Sin decisión' };

const percent = value => (value === null || value === undefined ? 'Sin muestra' : `${(Number(value) * 100).toFixed(1)} %`);
const interval = range => (range ? `${(range.low * 100).toFixed(1)} a ${(range.high * 100).toFixed(1)} %` : '—');
const number = value => Number(value || 0).toLocaleString('es-PE');

function Kpi({ label, value, hint }) {
  return (
    <div className="grid content-start gap-1 rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      <strong className="text-2xl font-bold leading-tight text-ink-strong md:text-3xl">{value}</strong>
      {hint && <small className="text-xs text-muted">{hint}</small>}
    </div>
  );
}

function Card({ title, subtitle, children, className = '' }) {
  return (
    <Panel className={`grid content-start gap-4 p-5 ${className}`}>
      <div>
        <h3 className="text-base font-bold text-ink-strong">{title}</h3>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      {children}
    </Panel>
  );
}

// Rejilla clara y ejes oscuros en L, como en la referencia de diseño.
const GRID_STYLE = {
  backgroundImage: 'linear-gradient(to bottom, #e3e8ef 1px, transparent 1px), linear-gradient(to right, #e3e8ef 1px, transparent 1px)',
  backgroundSize: '100% 20%, 10% 100%',
};

// Barras verticales finas, una por categoría, con su valor encima y su etiqueta debajo.
// Si `max` es 1 (porcentaje), la altura es proporcional a 0–100 %.
function VerticalBars({ rows, ariaLabel, format = percent, max, colorFor = () => PRIMARY }) {
  const scale = max ?? Math.max(0.0001, ...rows.map(row => row.value || 0));
  return (
    <div role="img" aria-label={ariaLabel} style={GRID_STYLE} className="grid h-40 grid-flow-col auto-cols-fr items-end gap-2 border-b-2 border-l-2 border-[#0b2e3f] px-2 pb-1">
      {rows.map((row, index) => {
        const height = Math.max(0, ((row.value || 0) / scale) * 100);
        return (
          <div key={row.label} className="grid h-full min-w-0 grid-rows-[auto_1fr_auto] items-end gap-1" title={`${row.label}: ${format(row.value)}`}>
            <span className="break-words text-center text-xs font-semibold text-ink-strong">{format(row.value)}</span>
            <div className="flex h-full items-end justify-center">
              <span className="block w-6 rounded-t-sm" style={{ height: `${height}%`, background: colorFor(row, index) }} />
            </div>
            <span className="truncate text-center text-[11px] text-muted">{row.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// Cada columna conserva su escala de 0 a 100 % y muestra su propia cantidad.
function ConfidenceBars({ rows }) {
  return (
    <figure aria-label="Coincidencia por banda de confianza" className="m-0 grid min-w-0 gap-2">
      <div className="grid grid-flow-col auto-cols-fr gap-1 sm:gap-2">
        {rows.map(row => (
          <div key={row.label} className="grid min-w-0 grid-rows-[auto_9rem_auto_auto] gap-1 text-center">
            <strong className="text-xs tabular-nums text-ink-strong">{percent(row.value)}</strong>
            <div className="flex items-end justify-center border-b border-line" style={GRID_STYLE}>
              <span aria-hidden="true" className="block w-[60%] max-w-[56px] rounded-t-sm bg-[#0759bb]" style={{ height: row.value == null ? '0%' : `${Math.max(0, Math.min(1, Number(row.value))) * 100}%` }} />
            </div>
            <span className="break-words text-xs leading-tight text-ink">{row.label}</span>
            <small className="break-words text-[11px] leading-tight text-muted">{number(row.count)} comparados</small>
          </div>
        ))}
      </div>
    </figure>
  );
}

// Línea sobre el ritmo diario de decisiones humanas: la forma adecuada para una serie en el tiempo.
function DailyLine({ points, ariaLabel }) {
  const width = 640;
  const height = 150;
  const max = Math.max(1, ...points.map(point => point.count));
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const coords = points.map((point, index) => [index * step, height - (point.count / max) * (height - 16) - 8]);
  const path = coords.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <div className="grid gap-2">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} className="h-40 w-full" preserveAspectRatio="none">
        <path d={path} fill="none" stroke={PRIMARY} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {coords.map(([x, y], index) => (
          <circle key={points[index].day} cx={x} cy={y} r="4" fill={PRIMARY} vectorEffect="non-scaling-stroke">
            <title>{`${points[index].day}: ${points[index].count} decisiones`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between text-xs text-muted">
        <span>{points[0].day}</span>
        <span>{points[points.length - 1].day}</span>
      </div>
    </div>
  );
}

function Locked({ message }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-line bg-[#f8fbff] px-5 py-4">
      <div className="grid gap-0.5">
        <span className="text-sm font-semibold text-ink-strong">Codificación con base de referencia · bloqueado</span>
        <span className="text-xs text-muted">{message}</span>
      </div>
    </div>
  );
}

// Avance de un grupo de personas (codificadores o analistas de referencia): barras y tabla.
function ProgressCard({ title, subtitle, people, first, second, compact }) {
  return (
    <Card title={title} subtitle={subtitle}>
      {first === 'Coinciden' ? <AnalystColumns people={people}/> : <Ranking rows={people.map(person => ({ label: person.name, value: person.cases }))} total={0}/>}
      {!compact && (
        <div role="region" aria-label={`Tabla: ${title}`} tabIndex={0} className={`${t.wrap} mt-3`}>
          <table className={t.table}>
            <thead className={t.head}>
              <tr>
                <th scope="col" className={t.th}>Persona</th>
                <th scope="col" className={t.th}>Código</th>
                <th scope="col" className={t.th}>Casos</th>
                <th scope="col" className={t.th}>{first}</th>
                <th scope="col" className={t.th}>{second}</th>
                <th scope="col" className={t.th}>Estado</th>{first === 'Coinciden' && <th scope="col" className={t.th}>Coincidencia · IC 95 %</th>}
              </tr>
            </thead>
            <tbody className={t.body}>
              {people.map(person => (
                <tr key={person.id} className={t.row}>
                  <td data-label="Persona" className={t.cell}><strong className="text-ink-strong">{person.name}</strong></td>
                  <td data-label="Código" className={t.cell}>{person.code}</td>
                  <td data-label="Casos" className={t.cell}>{number(person.cases)}</td>
                  <td data-label={first} className={t.cell}>{number(person.correct)}</td>
                  <td data-label={second} className={t.cell}>{number(person.incorrect)}</td>
                  <td data-label="Estado" className={t.cell}>{person.state}</td>{first === 'Coinciden' && <td data-label="Coincidencia · IC 95 %" className={t.cell}>{percent(person.accuracy)} · {interval(person.interval)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ¿Hay una base codificada activa con coincidencias? Lo usan el tablero y la página de Codificación.
export function referenceIsVisible(data) {
  if (!data) return false;
  return data.referenceVisible ?? (Boolean(data.reference) && data.kpis.matchedWithReference > 0);
}

// Tablero de codificación. Con base codificada activa muestra exactitud y comparación. Sin ella, esos gráficos
// quedan bloqueados; el avance humano solo aparece cuando un codificador completó la base.
// `quiet` no muestra avisos de bloqueo (lo usa Codificación: si no hay nada que mostrar, no sale nada).
export default function CodingDashboard({ datasetId, data: preloaded, compact = false, quiet = false, view = null, summary = null }) {
  const [fetched, setFetched] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (preloaded || !datasetId) return undefined;
    let cancelled = false;
    setError('');
    getCodingDashboardReal(datasetId)
      .then(result => { if (!cancelled) setFetched(result); })
      .catch(cause => { if (!cancelled) setError(cause.message); });
    return () => { cancelled = true; };
  }, [datasetId, preloaded]);

  const show = section => !view || view === section;
  const data = preloaded ?? fetched;
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data) return null;
  if (!data.coderSectionVisible) {
    return quiet ? null : <Locked message="Activa una base codificada en Bases → Herramientas avanzadas para ver exactitud, avance por analista y confusiones." />;
  }

  const { kpis, coders, analystsReference, byBand, byOrigin, byDivision, confusions, daily, reference } = data;
  const referenceVisible = referenceIsVisible(data);
  // Codificadores (decisiones humanas) y analistas de la referencia se muestran por separado: uno no reemplaza al otro.
  const coderRows = coders.map(row => ({ id: row.userId, name: row.name, code: row.analystCode || '—', cases: row.casesCovered, correct: row.confirmations, incorrect: row.corrections, state: row.completedBase ? 'Base completa' : 'En curso' }));
  const analystRows = referenceVisible ? analystsReference.map(row => ({ id: row.analyst, name: row.analyst, code: row.analyst, cases: row.reviewed, correct: row.correct, incorrect: row.incorrect, interval: row.interval, accuracy: row.accuracy, state: 'Referencia' })) : [];
  const accuracyRows = analystsReference.map(row => ({ label: row.analyst, value: row.accuracy, interval: row.interval }));
  const bandRows = [...byBand]
    .sort((a, b) => BAND_ORDER.indexOf(a.band) - BAND_ORDER.indexOf(b.band))
    .map(row => ({ label: BAND_LABEL[row.band] || row.band, value: row.accuracy, count: row.verified }));
  const originRows = byOrigin.map(row => ({ label: ORIGIN_LABEL[row.origin] || row.origin, value: row.accuracy, count: row.verified }));
  const divisionRows = byDivision.map(row => ({ label: row.division, value: row.accuracy }));

  return (
    <section aria-label="Tablero de codificación" className="grid gap-5">
      {show('resumen') && <><div className="flex flex-wrap items-center justify-between gap-2">
        {referenceVisible && reference ? (
          <p className="text-sm text-muted">Referencia activa: <strong className="text-ink">{reference.name}</strong> · {reference.period} · {number(reference.records)} registros</p>
        ) : <span />}
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label="Registros" value={number(kpis.records)} />
        {referenceVisible && <Kpi label="Comparados" value={number(kpis.compared)} hint={number(kpis.pending)+' sin código'} />}
        {referenceVisible && <Kpi label="Coincidencia con referencia" value={percent(kpis.accuracy)} hint={'IC 95 %: '+interval(kpis.interval)} />}
        {summary && <Kpi label="Necesitan revisión" value={percent(summary.rates.review)} hint={number(summary.totals.review)+' registros'} />}
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-2 rounded-xl border border-line bg-white px-4 py-3 text-sm">
        {referenceVisible && <span>Coinciden: <strong>{number(kpis.compared-kpis.incorrect)}</strong></span>}
        {referenceVisible && <span>No coinciden: <strong>{number(kpis.incorrect)}</strong></span>}
        <span>Codificadores: <strong>{number(kpis.coders)}</strong> · {number(kpis.humanDecisions)} decisiones</span>
        {referenceVisible && <span>Con referencia: <strong>{number(kpis.matchedWithReference)}</strong></span>}
      </div>
      </>}
      {show('desempeno') && analystRows.length > 0 && (
        <ProgressCard title="Avance por analista" subtitle="Casos comparados con la referencia." people={analystRows} first="Coinciden" second="No coinciden" compact={compact} />
      )}

      {referenceVisible ? (
        <div className={view === 'comparaciones' ? 'grid gap-5' : 'grid items-stretch gap-5 xl:grid-cols-2'}>
          {show('desempeno') && bandRows.length > 0 && (
            <Card title="Coincidencia por confianza" subtitle="Cómo cambia la exactitud según el puntaje del clasificador.">
              <ConfidenceBars rows={bandRows} />
            </Card>
          )}
          {show('desempeno') && originRows.length > 0 && (
            <Card title="Coincidencia por origen" subtitle="Quién cerró la decisión.">
              <Ranking rows={originRows} percent showColumns />
            </Card>
          )}
          {show('comparaciones') && (
            <Card title="Confusiones más frecuentes" className="w-full max-w-xl justify-self-center">
              {confusions.length ? <div role="region" aria-label="Confusiones entre sistema y referencia" className="overflow-hidden rounded-lg border border-line">
                <table className="w-full table-fixed text-left text-sm">
                  <thead className="bg-[#f5f8fd] text-muted"><tr><th scope="col" className="px-3 py-2 font-semibold">Sistema</th><th scope="col" className="px-3 py-2 font-semibold">Referencia</th><th scope="col" className="px-3 py-2 font-semibold">Cantidad de casos</th></tr></thead>
                  <tbody>{[...confusions].sort((a, b) => b.count - a.count).map(row => <tr key={row.systemCode + '-' + row.referenceCode} className="border-t border-line"><td className="px-3 py-1.5 font-medium text-ink-strong">{row.systemCode}</td><td className="px-3 py-1.5 font-medium text-ink-strong">{row.referenceCode}</td><td className="px-3 py-1.5 font-semibold tabular-nums text-ink-strong">{number(row.count)}</td></tr>)}</tbody>
                </table>
              </div> : <p className="text-sm text-muted">No hay confusiones disponibles para esta base.</p>}
            </Card>
          )}
        </div>
      ) : (
        !quiet && <Locked message="Exactitud, confusiones y comparación se activan con una base codificada activa. Este avance humano se muestra porque un codificador completó la base." />
      )}


    </section>
  );
}
