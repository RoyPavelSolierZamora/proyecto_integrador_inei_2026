import { useEffect, useState } from 'react';
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
function VerticalBars({ rows, ariaLabel, format = percent, max, colorFor = (row, index) => CATEGORY[index % CATEGORY.length] }) {
  const scale = max ?? Math.max(0.0001, ...rows.map(row => row.value || 0));
  return (
    <div role="img" aria-label={ariaLabel} style={GRID_STYLE} className="grid h-56 grid-flow-col auto-cols-fr items-end gap-2 border-b-2 border-l-2 border-[#0b2e3f] px-2 pb-1">
      {rows.map((row, index) => {
        const height = Math.max(3, ((row.value || 0) / scale) * 100);
        return (
          <div key={row.label} className="grid h-full min-w-0 grid-rows-[auto_1fr_auto] items-end gap-1" title={`${row.label}: ${format(row.value)}`}>
            <span className="truncate text-center text-[11px] font-semibold text-ink-strong">{format(row.value)}</span>
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
      <VerticalBars rows={people.map(person => ({ label: person.name, value: person.cases }))} format={number} ariaLabel={`${title}: casos por persona`} max={Math.max(1, ...people.map(person => person.cases))} />
      {!compact && (
        <div role="region" aria-label={`Tabla: ${title}`} tabIndex={0} className={t.wrap}>
          <table className={t.table}>
            <thead className={t.head}>
              <tr>
                <th scope="col" className={t.th}>Persona</th>
                <th scope="col" className={t.th}>Código</th>
                <th scope="col" className={t.th}>Casos</th>
                <th scope="col" className={t.th}>{first}</th>
                <th scope="col" className={t.th}>{second}</th>
                <th scope="col" className={t.th}>Estado</th>
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
                  <td data-label="Estado" className={t.cell}>{person.state}</td>
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
export default function CodingDashboard({ datasetId, data: preloaded, compact = false, quiet = false }) {
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
  const analystRows = referenceVisible ? analystsReference.map(row => ({ id: row.analyst, name: row.analyst, code: row.analyst, cases: row.reviewed, correct: row.correct, incorrect: row.incorrect, state: 'Referencia' })) : [];
  const accuracyRows = analystsReference.map(row => ({ label: row.analyst, value: row.accuracy, interval: row.interval }));
  const bandRows = [...byBand]
    .sort((a, b) => BAND_ORDER.indexOf(a.band) - BAND_ORDER.indexOf(b.band))
    .map(row => ({ label: BAND_LABEL[row.band] || row.band, value: row.accuracy }));
  const originRows = byOrigin.map(row => ({ label: ORIGIN_LABEL[row.origin] || row.origin, value: row.accuracy }));
  const divisionRows = byDivision.slice(0, 12).map(row => ({ label: row.division, value: row.accuracy }));

  return (
    <section aria-label="Tablero de codificación" className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {referenceVisible && reference ? (
          <p className="text-sm text-muted">Referencia activa: <strong className="text-ink">{reference.name}</strong> · {reference.period} · {number(reference.records)} registros</p>
        ) : <span />}
      </div>

      <div className={`grid grid-cols-2 gap-3 md:grid-cols-3 ${referenceVisible ? 'xl:grid-cols-6' : 'xl:grid-cols-3'}`}>
        <Kpi label="Registros" value={number(kpis.records)} />
        {referenceVisible && <Kpi label="Comparados" value={number(kpis.compared)} hint={`${number(kpis.pending)} sin código`} />}
        {referenceVisible && <Kpi label="Exactitud" value={percent(kpis.accuracy)} hint={`IC 95 %: ${interval(kpis.interval)}`} />}
        {referenceVisible && <Kpi label="No coinciden" value={number(kpis.incorrect)} />}
        <Kpi label="Codificadores" value={number(kpis.coders)} hint={`${number(kpis.humanDecisions)} decisiones`} />
        {referenceVisible && <Kpi label="Con referencia" value={number(kpis.matchedWithReference)} hint="registros en la referencia" />}
      </div>

      {coderRows.length > 0 && (
        <ProgressCard title="Avance por codificador" subtitle="Casos registrados por persona." people={coderRows} first="Confirmados" second="Corregidos" compact={compact} />
      )}
      {analystRows.length > 0 && (
        <ProgressCard title="Avance por analista" subtitle="Casos comparados con la referencia." people={analystRows} first="Coinciden" second="No coinciden" compact={compact} />
      )}

      {referenceVisible ? (
        <div className="grid gap-5 md:grid-cols-2">
          {accuracyRows.length > 0 && (
            <Card title="Exactitud por analista" subtitle="Frente a la referencia activa.">
              <VerticalBars rows={accuracyRows} ariaLabel="Exactitud por analista" max={1} />
              <ul className="grid gap-1 text-xs text-muted">
                {accuracyRows.map(row => <li key={row.label}>{row.label}: IC 95 % {interval(row.interval)}</li>)}
              </ul>
            </Card>
          )}
          {bandRows.length > 0 && (
            <Card title="Exactitud por confianza" subtitle="Cómo cambia la exactitud según el puntaje del clasificador.">
              <VerticalBars rows={bandRows} ariaLabel="Exactitud por banda de confianza" max={1} />
            </Card>
          )}
          {originRows.length > 0 && (
            <Card title="Exactitud por origen" subtitle="Quién cerró la decisión.">
              <VerticalBars rows={originRows} ariaLabel="Exactitud por origen" max={1} />
            </Card>
          )}
          {divisionRows.length > 0 && (
            <Card title="Exactitud por división CIIU" subtitle="Dos primeros dígitos del código. El número de arriba es la exactitud; el de abajo, la división." className="md:col-span-2">
              <div className="overflow-x-auto pb-1">
                <div className="min-w-[320px]">
                  <VerticalBars rows={divisionRows} ariaLabel="Exactitud por división CIIU" max={1} />
                </div>
              </div>
            </Card>
          )}
          {confusions.length > 0 && (
            <Card title="Confusiones más frecuentes" subtitle="Lo que dijo el sistema frente a la referencia.">
              <div role="region" aria-label="Confusiones entre sistema y referencia" tabIndex={0} className={t.wrap}>
                <table className={t.table}>
                  <thead className={t.head}>
                    <tr>
                      <th scope="col" className={t.th}>Sistema dijo</th>
                      <th scope="col" className={t.th}>Referencia</th>
                      <th scope="col" className={t.th}>Casos</th>
                    </tr>
                  </thead>
                  <tbody className={t.body}>
                    {confusions.map(row => (
                      <tr key={`${row.systemCode}-${row.referenceCode}`} className={t.row}>
                        <td data-label="Sistema dijo" className={t.cell}>{row.systemCode}</td>
                        <td data-label="Referencia" className={t.cell}>{row.referenceCode}</td>
                        <td data-label="Casos" className={t.cell}><strong className="text-ink-strong">{row.count}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      ) : (
        !quiet && <Locked message="Exactitud, confusiones y comparación se activan con una base codificada activa. Este avance humano se muestra porque un codificador completó la base." />
      )}

      {daily.length > 0 && (
        <Card title="Decisiones humanas por día" subtitle="Ritmo de codificación de la base.">
          <DailyLine points={daily} ariaLabel="Decisiones humanas por día" />
        </Card>
      )}
    </section>
  );
}
