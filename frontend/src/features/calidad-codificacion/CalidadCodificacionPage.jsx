import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../shared/ui/PageHeader.jsx';
import Panel from '../../shared/ui/Panel.jsx';
import PanelHeading from '../../shared/ui/PanelHeading.jsx';
import Button from '../../shared/ui/Button.jsx';
import Notice from '../../shared/ui/Notice.jsx';
import { tableClasses as t } from '../../shared/ui/tableClasses.js';
import EChart from './EChart.jsx';
import BaseSelect from './BaseSelect.jsx';
import {
  accuracyShares,
  equalShares,
  formatPercentText,
  SOURCE_HELP,
  SOURCE_SHORT,
} from './repartoUi.js';
import {
  createRepartoReal,
  deleteLoteReal,
  deleteRepartoReal,
  downloadLoteReal,
  getResumenReal,
  listAnalystsReal,
  listBasesReal,
  previewRepartoReal,
  reassignLoteReal,
  setLoteActivoReal,
  setRepartoActivoReal,
} from './calidadClient.js';

// Un color fijo por codificador: el mismo en gráficas y tablas. Gris = sin codificador.
const CODER_COLORS = ['#0759bb', '#d9731e', '#2f9e6b', '#7b4fb5', '#b3261e', '#0f8b9a', '#c2185b', '#6d4c41'];
const NO_CODER_COLOR = '#8b97a8';
const PENDING_COLOR = '#c9d3e0';
const WHAT = [
  { value: 'todas', title: 'Toda la base', text: 'Todo lo pendiente, sin separar por fuente.' },
  { value: 'review', title: 'Solo revisión manual', text: 'Casos que el sistema derivó a una persona.' },
  { value: 'ml', title: 'Verificar clasificador', text: 'Confirmar o corregir lo que cerró el clasificador.' },
  { value: 'llm', title: 'Verificar asistente de IA', text: 'Confirmar o corregir lo que cerró la IA.' },
];
const QUICK_PARTS = [2, 3, 4, 5, 10];
const STEPS = ['Base y qué partir', 'Personas', 'Revisar y crear'];

const countText = value => Number(value || 0).toLocaleString('es-PE');
const dateText = value => (value ? new Date(value).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : '');

// people: [{ name, percent, color }]
const personBarOption = people => ({
  grid: { left: 8, right: 44, top: 4, bottom: 4, containLabel: true },
  tooltip: { trigger: 'axis', valueFormatter: value => formatPercentText(value) },
  xAxis: { type: 'value', max: 100, axisLabel: { color: '#495770', formatter: '{value} %' }, splitLine: { lineStyle: { color: '#e6ecf4' } } },
  yAxis: { type: 'category', data: people.map(person => person.name), inverse: true, axisLabel: { color: '#24364a', fontSize: 12 }, axisTick: { show: false } },
  series: [{
    type: 'bar',
    barWidth: 14,
    data: people.map(person => ({ value: person.percent, itemStyle: { color: person.color, borderRadius: [0, 4, 4, 0] } })),
    label: { show: true, position: 'right', color: '#24364a', fontWeight: 600, formatter: ({ value }) => formatPercentText(value) },
  }],
});

// series: [{ name, color, values: Map(día -> casos) }]. Barras apiladas: cada color es un codificador.
const dayBarOption = (days, series) => ({
  grid: { left: 36, right: 8, top: series.length > 1 ? 34 : 18, bottom: 26 },
  tooltip: { trigger: 'axis' },
  legend: { show: series.length > 1, top: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { color: '#24364a', fontSize: 11 } },
  xAxis: { type: 'category', data: days.map(day => day.slice(5)), axisLabel: { color: '#495770', fontSize: 11 } },
  yAxis: { type: 'value', minInterval: 1, axisLabel: { color: '#495770' }, splitLine: { lineStyle: { color: '#e6ecf4' } } },
  series: series.map(entry => ({
    name: entry.name,
    type: 'bar',
    stack: 'dia',
    barWidth: 18,
    itemStyle: { color: entry.color },
    data: days.map(day => entry.values.get(day) || 0),
  })),
});

// segments: [{ name, value, color }]
const donutOption = segments => ({
  tooltip: { trigger: 'item', formatter: '{b}: {c} ({d} %)' },
  legend: { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, type: 'scroll', textStyle: { color: '#24364a', fontSize: 11 } },
  series: [{
    type: 'pie',
    radius: ['54%', '78%'],
    center: ['50%', '42%'],
    label: { show: false },
    data: segments.map(segment => ({ name: segment.name, value: segment.value, itemStyle: { color: segment.color } })),
  }],
});

function Kpi({ label, value, hint }) {
  return (
    <div className="grid content-start gap-1 rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      <strong className="text-2xl font-bold leading-tight text-ink-strong">{value}</strong>
      {hint && <small className="text-xs text-muted">{hint}</small>}
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <section className="grid content-start gap-2 rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-ink-strong">{title}</h3>
      {children}
    </section>
  );
}

function Empty({ children }) {
  return <p className="grid h-[220px] place-items-center text-center text-sm text-muted">{children}</p>;
}

function StatusPill({ group }) {
  const tone = group.active
    ? 'bg-[#e4f7ec] text-[#05603a]'
    : group.partial ? 'bg-[#fff4df] text-[#8a5300]' : 'bg-line text-muted';
  const text = group.active ? 'Activo' : group.partial ? 'Parcial' : 'Inactivo';
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{text}</span>;
}

function Stepper({ step }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Pasos del reparto">
      {STEPS.map((label, index) => {
        const number = index + 1;
        const current = number === step;
        const done = number < step;
        return (
          <li key={label} aria-current={current ? 'step' : undefined} className="flex items-center gap-1.5">
            <span className={['grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold', done || current ? 'bg-brand text-white' : 'bg-line text-muted'].join(' ')}>
              {done ? '✓' : number}
            </span>
            <span className={current ? 'text-sm font-semibold text-ink-strong' : 'hidden text-sm text-muted md:inline'}>{label}</span>
            {index < STEPS.length - 1 && <span aria-hidden="true" className="mx-0.5 hidden h-px w-5 bg-line sm:block" />}
          </li>
        );
      })}
    </ol>
  );
}

// Agrupa los lotes por reparto (más reciente primero). Los lotes anteriores se agrupan por base y van al final.
function groupRepartos(lots) {
  const groups = new Map();
  for (const lot of lots) {
    const key = lot.repartoId ? `r-${lot.repartoId}` : `b-${lot.base}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        repartoId: lot.repartoId,
        name: lot.repartoName,
        baseName: lot.baseName,
        period: lot.period,
        createdAt: lot.repartoCreatedAt,
        lots: [],
      });
    }
    groups.get(key).lots.push(lot);
  }
  return [...groups.values()]
    .map(group => {
      const ordered = [...group.lots].sort((a, b) => a.lot - b.lot);
      const assigned = ordered.reduce((sum, lot) => sum + lot.assigned, 0);
      const decided = ordered.reduce((sum, lot) => sum + lot.decided, 0);
      const active = ordered.every(lot => lot.active);
      const partial = !active && ordered.some(lot => lot.active);
      return {
        ...group,
        lots: ordered,
        assigned,
        decided,
        percent: assigned ? Math.round((decided / assigned) * 1000) / 10 : 0,
        locked: decided > 0,
        active,
        partial,
      };
    })
    .sort((a, b) => (b.repartoId || 0) - (a.repartoId || 0));
}

export default function CalidadCodificacionPage() {
  const [bases, setBases] = useState([]);
  const [users, setUsers] = useState([]);
  const [step, setStep] = useState(1);
  const [baseId, setBaseId] = useState('');
  const [source, setSource] = useState('');
  const [partCount, setPartCount] = useState(3);
  const [people, setPeople] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [sizes, setSizes] = useState(null);
  const [repartoName, setRepartoName] = useState('');
  const [preview, setPreview] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [filtroBase, setFiltroBase] = useState('');
  const [scopeKey, setScopeKey] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [confirmKey, setConfirmKey] = useState(null);
  const [vista, setVista] = useState('avance');

  function loadBases() {
    return listBasesReal().then(data => {
      setBases(data.bases);
      return data.bases;
    });
  }

  useEffect(() => {
    Promise.all([loadBases(), listAnalystsReal()])
      .then(([loaded, userData]) => {
        setUsers(userData.users);
        // Por defecto se propone la base más reciente, que el servidor devuelve primero.
        if (loaded[0]) setBaseId(String(loaded[0].id));
      })
      .catch(error => setMessage({ tone: 'error', text: error.message }));
  }, []);

  // El avance se actualiza cada 20 segundos mientras la página está abierta.
  useEffect(() => {
    let cancelled = false;
    const load = () => getResumenReal(filtroBase)
      .then(data => { if (!cancelled) { setResumen(data); setUpdatedAt(new Date()); } })
      .catch(error => { if (!cancelled) setMessage({ tone: 'error', text: error.message }); });
    load();
    const timer = setInterval(load, 20000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [filtroBase]);

  const base = useMemo(() => bases.find(item => String(item.id) === baseId) || null, [bases, baseId]);
  const userById = useMemo(() => new Map(users.map(user => [String(user.id), user])), [users]);
  const personas = resumen?.people || [];
  const lots = resumen?.lots || [];
  const groups = useMemo(() => groupRepartos(lots), [lots]);

  // Color fijo por codificador según su id: no cambia al filtrar ni al recargar.
  const coderColor = useMemo(() => {
    const ids = [...new Set([
      ...users.map(user => Number(user.id)),
      ...lots.map(lot => lot.assigneeId).filter(id => id !== null),
    ])].sort((a, b) => a - b);
    return new Map(ids.map((id, index) => [id, CODER_COLORS[index % CODER_COLORS.length]]));
  }, [users, lots]);
  const colorOf = id => (id === null || id === undefined ? NO_CODER_COLOR : coderColor.get(Number(id)) || NO_CODER_COLOR);

  // Alcance de las gráficas: el reparto elegido (por defecto el más reciente) o todos.
  const effectiveKey = scopeKey === 'todos'
    ? 'todos'
    : (groups.some(group => group.key === scopeKey) ? scopeKey : (groups[0]?.key || 'todos'));
  const scopeGroup = effectiveKey === 'todos' ? null : groups.find(group => group.key === effectiveKey);
  const scopeLots = useMemo(() => (scopeGroup ? scopeGroup.lots : lots), [scopeGroup, lots]);

  const scopeTotals = useMemo(() => {
    const assigned = scopeLots.reduce((sum, lot) => sum + lot.assigned, 0);
    const decided = scopeLots.reduce((sum, lot) => sum + lot.decided, 0);
    const verified = scopeLots.reduce((sum, lot) => sum + lot.verified, 0);
    const correct = scopeLots.reduce((sum, lot) => sum + lot.correct, 0);
    return {
      assigned,
      decided,
      remaining: assigned - decided,
      percent: assigned ? Math.round((decided / assigned) * 1000) / 10 : 0,
      verified,
      accuracy: verified ? correct / verified : null,
    };
  }, [scopeLots]);

  const scopePeople = useMemo(() => {
    const map = new Map();
    for (const lot of scopeLots) {
      if (lot.assigneeId === null) continue;
      const entry = map.get(lot.assigneeId) || { id: lot.assigneeId, name: lot.name, assigned: 0, decided: 0 };
      entry.assigned += lot.assigned;
      entry.decided += lot.decided;
      map.set(lot.assigneeId, entry);
    }
    return [...map.values()].map(entry => ({
      ...entry,
      color: colorOf(entry.id),
      percent: entry.assigned ? Math.round((entry.decided / entry.assigned) * 1000) / 10 : 0,
    }));
  }, [scopeLots, coderColor]);

  // Ritmo diario apilado por codificador: cada persona conserva su color.
  const scopeDaily = useMemo(() => {
    const days = new Set();
    const byCoder = new Map();
    for (const lot of scopeLots) {
      const key = lot.assigneeId;
      if (!byCoder.has(key)) byCoder.set(key, { id: key, name: lot.name, values: new Map() });
      const entry = byCoder.get(key);
      for (const item of lot.daily || []) {
        days.add(item.day);
        entry.values.set(item.day, (entry.values.get(item.day) || 0) + item.count);
      }
    }
    return {
      days: [...days].sort(),
      series: [...byCoder.values()]
        .filter(entry => entry.values.size > 0)
        .map(entry => ({ name: entry.name, color: colorOf(entry.id), values: entry.values })),
    };
  }, [scopeLots, coderColor]);

  function pendingFor(item, value) {
    if (!item) return 0;
    if (value === 'todas') return item.pending.ml + item.pending.llm + item.pending.review;
    return item.pending[value] || 0;
  }

  const sourcePending = pendingFor(base, source);
  const shares = sizes && sizes.length === partCount ? sizes : equalShares(partCount);
  const partCases = shares.map(share => Math.round((sourcePending * share) / 100));

  function items() {
    return shares.map((share, index) => ({
      base: Number(baseId),
      fuente: source,
      codificador: assignments[index] ? Number(assignments[index]) : null,
      porcentaje: share,
    }));
  }

  function setPartCountSafe(value) {
    const next = Math.min(20, Math.max(1, value));
    setPartCount(next);
    setAssignments(list => Array.from({ length: next }, (_, index) => list[index] || ''));
    setSizes(null);
    setPreview(null);
  }

  function togglePerson(id) {
    setPeople(list => (list.includes(id) ? list.filter(item => item !== id) : [...list, id]));
    setPreview(null);
  }

  function assignInOrder() {
    if (!people.length) return;
    setAssignments(Array.from({ length: partCount }, (_, index) => String(people[index % people.length])));
    setSizes(null);
    setPreview(null);
  }

  function setAssignment(index, value) {
    setAssignments(list => list.map((item, position) => (position === index ? value : item)));
    setSizes(null);
    setPreview(null);
  }

  // Tamaños según precisión verificada. Quien acierta menos recibe menos casos.
  function applyAccuracySizes() {
    const accuracy = new Map(personas.map(person => [String(person.assigneeId), person.accuracy]));
    setSizes(accuracyShares(assignments.map(value => (value ? accuracy.get(String(value)) ?? null : null))));
    setPreview(null);
  }

  function resetWizard() {
    setStep(1);
    setSource('');
    setPeople([]);
    setAssignments([]);
    setSizes(null);
    setRepartoName('');
    setPartCount(3);
    setPreview(null);
  }

  async function refreshAll() {
    await loadBases();
    setResumen(await getResumenReal(filtroBase));
    setUpdatedAt(new Date());
  }

  async function goToReview() {
    setBusy(true);
    setMessage(null);
    try {
      setPreview(await previewRepartoReal(items()));
      setStep(3);
    } catch (error) {
      setMessage({ tone: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function crear() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await createRepartoReal(items(), repartoName.trim());
      const total = result.lots.reduce((sum, lot) => sum + lot.casos, 0);
      setMessage({ tone: 'success', text: `«${result.name}» creado: ${result.lots.length} partes con ${countText(total)} casos. Ya aparece a sus codificadores.` });
      resetWizard();
      setScopeKey(`r-${result.reparto}`);
      setVista('avance');
      await refreshAll();
    } catch (error) {
      setMessage({ tone: 'error', text: error.message });
      setPreview(null);
      setStep(2);
    } finally {
      setBusy(false);
    }
  }

  async function cambiarCodificador(lot, value) {
    setMessage(null);
    try {
      await reassignLoteReal(lot, value ? Number(value) : null);
      setResumen(await getResumenReal(filtroBase));
    } catch (error) {
      setMessage({ tone: 'error', text: error.message });
    }
  }

  // Activa o desactiva un reparto. Inactivo: sus codificadores no lo ven, pero se conservan casos y decisiones.
  async function cambiarActivo(group) {
    const activo = !group.active;
    setBusy(true);
    setMessage(null);
    try {
      if (group.repartoId) await setRepartoActivoReal(group.repartoId, activo);
      else for (const lot of group.lots) await setLoteActivoReal(lot.lot, activo);
      setMessage({
        tone: 'success',
        text: activo
          ? `«${group.name}» activado. Ya aparece a sus codificadores.`
          : `«${group.name}» desactivado. Sus codificadores ya no lo ven; las decisiones se conservan.`,
      });
      setResumen(await getResumenReal(filtroBase));
      setUpdatedAt(new Date());
    } catch (error) {
      setMessage({ tone: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  }

  // Elimina un reparto. Los repartos anteriores (sin reparto) se eliminan lote por lote.
  async function eliminarGrupo(group) {
    setBusy(true);
    setMessage(null);
    try {
      if (group.repartoId) {
        await deleteRepartoReal(group.repartoId);
      } else {
        for (const lot of group.lots) await deleteLoteReal(lot.lot);
      }
      setMessage({ tone: 'success', text: `«${group.name}» eliminado. Sus casos vuelven a estar pendientes.` });
      setConfirmKey(null);
      setScopeKey('');
      await refreshAll();
    } catch (error) {
      setMessage({ tone: 'error', text: error.message });
      setConfirmKey(null);
    } finally {
      setBusy(false);
    }
  }

  async function descargar(lot) {
    setMessage(null);
    try {
      const blob = await downloadLoteReal(lot);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `lote-${lot}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setMessage({ tone: 'error', text: error.message });
    }
  }

  const peopleOption = useMemo(() => personBarOption(scopePeople), [scopePeople]);
  const donut = useMemo(() => donutOption([
    ...scopePeople.map(person => ({ name: person.name, value: person.decided, color: person.color })),
    { name: 'Faltan', value: scopeTotals.remaining, color: PENDING_COLOR },
  ]), [scopePeople, scopeTotals]);
  const dayOption = useMemo(() => dayBarOption(scopeDaily.days, scopeDaily.series), [scopeDaily]);

  const canNextFromBase = Boolean(base && source && sourcePending > 0);
  const unassigned = assignments.filter(value => !value).length;
  const reuse = people.length > 0 && people.length < partCount;
  const idle = people.length > partCount;

  return (
    <section aria-label="Calidad de codificación" className="grid gap-5">
      <PageHeader
        icon="layers"
        title="Calidad de codificación"
        description="Parte una base y entrega cada parte a una persona. Luego sigue el avance y la precisión."
        actions={
          <div role="tablist" aria-label="Sección" className="inline-flex rounded-xl bg-[#e9f0f9] p-1">
            {[['avance', 'Avance'], ['nuevo', 'Nuevo reparto']].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={vista === value}
                onClick={() => setVista(value)}
                className={[
                  'border-0 h-9 rounded-lg px-4 text-sm font-semibold transition',
                  vista === value ? 'bg-white text-brand shadow-sm' : 'text-muted hover:text-ink',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {vista === 'avance' && (
      <>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-end">
        <div className="grid gap-1">
          <h2 className="text-lg font-bold text-ink-strong">Avance</h2>
          <p className="text-sm text-muted">Elige una base y un reparto para ver sus números.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <BaseSelect label="Base" bases={bases} value={filtroBase} onChange={setFiltroBase} allLabel="Todas las bases" />
          <label className="grid min-w-0 gap-1.5 text-sm font-semibold text-ink">
            Reparto a mostrar
            <select
              className="min-h-11 rounded-[9px] border border-[#b9c8cf] bg-white px-3 text-sm font-normal text-ink-strong"
              value={effectiveKey}
              onChange={event => setScopeKey(event.target.value)}
              disabled={!groups.length}
            >
              <option value="todos">Todos los repartos</option>
              {groups.map(group => (
                <option key={group.key} value={group.key}>
                  {group.name} · {group.baseName}{group.active ? '' : ' (inactivo)'}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {!lots.length ? (
        <Notice tone="info">Todavía no hay repartos{filtroBase ? ' para esta base' : ''}.</Notice>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi
              label="Asignados"
              value={countText(scopeTotals.assigned)}
              hint={`${countText(scopePeople.length)} ${scopePeople.length === 1 ? 'codificador' : 'codificadores'}`}
            />
            <Kpi label="Codificados" value={countText(scopeTotals.decided)} hint={`faltan ${countText(scopeTotals.remaining)}`} />
            <Kpi label="Avance" value={formatPercentText(scopeTotals.percent)} hint="de los casos asignados" />
            <Kpi
              label="Precisión"
              value={scopeTotals.accuracy === null ? 'Sin revisión' : formatPercentText(scopeTotals.accuracy * 100)}
              hint={scopeTotals.verified ? `${countText(scopeTotals.verified)} verificados` : 'Se calcula con la verificación'}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard title="Avance por codificador">
              {scopePeople.length
                ? <EChart option={peopleOption} label="Avance por codificador" height={220} />
                : <Empty>Este reparto aún no tiene codificadores.</Empty>}
            </ChartCard>
            <ChartCard title="Codificados y pendientes">
              {scopeTotals.assigned
                ? <EChart option={donut} label="Codificados y pendientes" height={220} />
                : <Empty>No hay casos asignados.</Empty>}
            </ChartCard>
            <ChartCard title="Decisiones por día">
              {scopeDaily.series.length
                ? <EChart option={dayOption} label="Decisiones por día" height={220} />
                : <Empty>Aún no hay decisiones en este alcance.</Empty>}
            </ChartCard>
          </div>

          <div className="grid gap-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-lg font-bold text-ink-strong">Repartos</h2>
              <p className="text-xs text-muted">Solo los repartos activos aparecen a sus codificadores. Desactivar conserva casos y decisiones.</p>
            </div>

            {groups.map(group => (
              <details key={group.key} open={group.key === effectiveKey} className="group rounded-2xl border border-line bg-surface shadow-sm">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span className="grid min-w-0 gap-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <strong className="truncate text-base text-ink-strong">{group.name}</strong>
                      <StatusPill group={group} />
                    </span>
                    <span className="text-xs text-muted">
                      {group.baseName} · {group.period}{group.createdAt ? ` · ${dateText(group.createdAt)}` : ''} · {countText(group.lots.length)} {group.lots.length === 1 ? 'parte' : 'partes'}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-sm tabular-nums text-ink">{countText(group.decided)} de {countText(group.assigned)}</span>
                    <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand tabular-nums">{formatPercentText(group.percent)}</span>
                    <span aria-hidden="true" className="text-muted transition group-open:rotate-180">▾</span>
                  </span>
                </summary>

                <div className="grid gap-3 border-t border-line p-4">
                  <div className={t.wrap}>
                    <table className={t.table}>
                      <thead className={t.head}>
                        <tr>
                          <th scope="col" className={t.th}>Parte</th>
                          <th scope="col" className={t.th}>Fuente</th>
                          <th scope="col" className={t.th}>Codificados</th>
                          <th scope="col" className={t.th}>Codificador</th>
                          <th scope="col" className={t.th}>Avance</th>
                          <th scope="col" className={t.th}><span className="sr-only">Acciones</span></th>
                        </tr>
                      </thead>
                      <tbody className={t.body}>
                        {group.lots.map((lot, index) => (
                          <tr key={lot.lot} className={t.row}>
                            <td data-label="Parte" className={t.cell}><strong className="text-ink-strong">{index + 1}</strong></td>
                            <td data-label="Fuente" className={t.cell}>
                              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">{SOURCE_SHORT[lot.fuente]}</span>
                            </td>
                            <td data-label="Codificados" className={t.cell}>
                              <span className="tabular-nums">{countText(lot.decided)} / {countText(lot.assigned)}</span>
                            </td>
                            <td data-label="Codificador" className={t.cell}>
                              <span className="flex items-center gap-2">
                                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: colorOf(lot.assigneeId) }} />
                                <select
                                  aria-label={`Codificador de la parte ${index + 1}`}
                                  className="min-h-9 w-full min-w-44 rounded-[9px] border border-[#b9c8cf] bg-white px-2 text-sm text-ink-strong disabled:opacity-60"
                                  value={lot.assigneeId ? String(lot.assigneeId) : ''}
                                  disabled={lot.decided > 0 || busy}
                                  onChange={event => cambiarCodificador(lot.lot, event.target.value)}
                                >
                                  <option value="">Sin asignar</option>
                                  {users.map(user => <option key={user.id} value={user.id}>{user.name} ({user.code})</option>)}
                                </select>
                              </span>
                            </td>
                            <td data-label="Avance" className={t.cell}>
                              <span className="flex items-center gap-2">
                                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-line" role="presentation">
                                  <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.min(100, lot.percent)}%` }} />
                                </span>
                                <span className="text-xs tabular-nums text-muted">{formatPercentText(lot.percent)}</span>
                              </span>
                            </td>
                            <td data-label="" className={t.cell}>
                              <Button variant="quiet" size="sm" onClick={() => descargar(lot.lot)}>Descargar CSV</Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => cambiarActivo(group)} disabled={busy}>
                      {group.active ? 'Desactivar' : 'Activar'}
                    </Button>
                    {confirmKey !== group.key ? (
                      <Button variant="danger" size="sm" onClick={() => setConfirmKey(group.key)} disabled={busy || group.locked}>
                        Eliminar reparto
                      </Button>
                    ) : (
                      <span className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-ink">¿Eliminar «{group.name}»? Sus casos volverán a estar pendientes.</span>
                        <Button variant="danger" size="sm" onClick={() => eliminarGrupo(group)} disabled={busy}>Sí, eliminar</Button>
                        <Button variant="quiet" size="sm" onClick={() => setConfirmKey(null)} disabled={busy}>Cancelar</Button>
                      </span>
                    )}
                    {group.locked && (
                      <span className="text-xs text-muted">Tiene decisiones: no se puede eliminar. Desactívalo para que deje de aparecer a sus codificadores.</span>
                    )}
                  </div>
                </div>
              </details>
            ))}
          </div>

          {updatedAt && (
            <p className="text-xs text-muted">Se actualiza cada 20 segundos · última vez a las {updatedAt.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</p>
          )}
        </>
      )}
      </>
      )}

      {vista === 'nuevo' && (
      <section aria-label="Nuevo reparto" className="grid gap-5 rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-ink-strong">Nuevo reparto</h2>
            <p className="text-sm text-muted">Tres pasos. Puedes volver atrás sin perder lo elegido.</p>
          </div>
          <Stepper step={step} />
        </header>

        {step === 1 && (
          <div className="grid gap-6">
            <BaseSelect
              label="Base"
              bases={bases}
              value={baseId}
              onChange={id => { setBaseId(id); setSource(''); }}
            />
            {!bases.length && <span className="text-sm text-muted">No hay bases del sistema.</span>}

            <div className="grid gap-2.5">
              <h3 className="text-sm font-semibold text-ink-strong">¿Qué partir?</h3>
              <div role="radiogroup" aria-label="Qué partir" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {WHAT.map(option => {
                  const count = pendingFor(base, option.value);
                  const on = source === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={count === 0}
                      onClick={() => setSource(option.value)}
                      className={[
                        'border-0 grid min-w-0 gap-0.5 rounded-xl px-4 py-3 text-left transition',
                        'disabled:cursor-not-allowed disabled:opacity-40',
                        on ? 'bg-brand-soft text-brand' : 'bg-[#f5f8fd] text-ink hover:bg-brand-soft',
                      ].join(' ')}
                    >
                      <span className="text-sm font-semibold leading-snug">{option.title}</span>
                      <span className={`text-xs tabular-nums ${on ? 'text-brand/80' : 'text-muted'}`}>{countText(count)} pendientes</span>
                    </button>
                  );
                })}
              </div>
              {source && <p className="text-sm text-muted">{WHAT.find(option => option.value === source)?.text}</p>}
            </div>

            <div className="grid gap-2.5">
              <h3 className="text-sm font-semibold text-ink-strong">¿En cuántas partes?</h3>
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center gap-1 rounded-xl bg-[#f0f4fa] p-1">
                  <button type="button" aria-label="Restar una parte" onClick={() => setPartCountSafe(partCount - 1)} className="border-0 grid size-8 place-items-center rounded-lg text-base font-semibold text-ink transition hover:bg-white">−</button>
                  <span className="min-w-8 text-center font-bold tabular-nums text-ink-strong" aria-live="polite">{partCount}</span>
                  <button type="button" aria-label="Sumar una parte" onClick={() => setPartCountSafe(partCount + 1)} className="border-0 grid size-8 place-items-center rounded-lg text-base font-semibold text-ink transition hover:bg-white">+</button>
                </div>
                <div role="group" aria-label="Número rápido de partes" className="inline-flex items-center gap-0.5 rounded-xl bg-[#f0f4fa] p-1">
                  {QUICK_PARTS.map(value => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={partCount === value}
                      onClick={() => setPartCountSafe(value)}
                      className={[
                        'border-0 h-8 min-w-9 rounded-lg px-2.5 text-sm font-semibold transition',
                        partCount === value ? 'bg-white text-brand shadow-sm' : 'text-muted hover:text-ink',
                      ].join(' ')}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                {source && (
                  <span className="text-sm text-muted">
                    ≈ <strong className="text-ink-strong">{countText(Math.round(sourcePending / partCount))}</strong> casos por parte
                  </span>
                )}
              </div>
            </div>

            <div className="flex justify-end border-t border-line pt-5">
              <Button className="w-full sm:w-auto" onClick={() => { setAssignments(Array.from({ length: partCount }, () => '')); setStep(2); }} disabled={!canNextFromBase}>
                Siguiente
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:gap-8">
            <div className="grid content-start gap-3">
              <div>
                <h3 className="text-sm font-semibold text-ink-strong">¿Quiénes codifican?</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Marca a las personas que recibirán partes. «Repartir en orden» las asigna por turnos; «Según precisión» da menos casos a quien acierta menos.
                </p>
              </div>
              {users.length === 0 && <p className="text-sm text-muted">No hay codificadores activos. Puedes crear las partes y asignarlas después.</p>}
              <ul role="group" aria-label="Personas que codifican" className="grid gap-1">
                {users.map(user => {
                  const on = people.includes(String(user.id));
                  return (
                    <li key={user.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => togglePerson(String(user.id))}
                        className={[
                          'border-0 flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left transition',
                          on ? 'bg-brand-soft text-brand' : 'bg-[#f5f8fd] text-ink hover:bg-brand-soft',
                        ].join(' ')}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{user.name}</span>
                          <span className={`block text-xs ${on ? 'text-brand/80' : 'text-muted'}`}>{user.code}</span>
                        </span>
                        <span aria-hidden="true" className={['grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold', on ? 'bg-brand text-white' : 'bg-white text-transparent ring-1 ring-[#c7d8ee]'].join(' ')}>✓</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={assignInOrder}
                  disabled={!people.length}
                  className="border-0 h-8 rounded-full bg-[#eef3fa] px-3.5 text-xs font-semibold text-brand transition hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Repartir en orden
                </button>
                <button
                  type="button"
                  onClick={applyAccuracySizes}
                  disabled={!personas.some(p => p.verified > 0) || !assignments.some(Boolean)}
                  className="border-0 h-8 rounded-full bg-[#eef3fa] px-3.5 text-xs font-semibold text-brand transition hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Según precisión
                </button>
                {sizes && (
                  <button type="button" onClick={() => setSizes(null)} className="border-0 h-8 rounded-full px-3 text-xs font-semibold text-muted transition hover:text-ink">
                    Quitar tamaños
                  </button>
                )}
              </div>
            </div>

            <div className="grid content-start gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink-strong">Partes</h3>
                <span className="text-xs tabular-nums text-muted">{partCount} {partCount === 1 ? 'parte' : 'partes'} · {countText(sourcePending)} casos</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {shares.map((share, index) => (
                  <div key={index} className="grid gap-2 rounded-xl bg-[#f5f8fd] px-3.5 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <strong className="text-sm text-ink-strong">Parte {index + 1}</strong>
                      <span className="text-xs tabular-nums text-muted">{countText(partCases[index])} casos · {formatPercentText(share)}</span>
                    </div>
                    <label className="min-w-0">
                      <span className="sr-only">Persona para la parte {index + 1}</span>
                      <select
                        className="min-h-10 w-full min-w-0 rounded-lg border-0 bg-white px-3 text-sm text-ink-strong ring-1 ring-[#dbe4f0] focus:ring-2 focus:ring-brand"
                        value={assignments[index] || ''}
                        onChange={event => setAssignment(index, event.target.value)}
                      >
                        <option value="">Sin asignar por ahora</option>
                        {users.map(user => <option key={user.id} value={user.id}>{user.name} ({user.code})</option>)}
                      </select>
                    </label>
                  </div>
                ))}
              </div>
              {sizes && <p className="text-xs text-muted">Tamaños según precisión: quien acierta menos recibe menos casos.</p>}
              {reuse && <Notice tone="info">Hay más partes que personas. Algunas personas tendrán más de una parte.</Notice>}
              {idle && <Notice tone="info">Hay más personas que partes. Algunas personas quedarán sin parte.</Notice>}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-between lg:col-span-2">
              <button type="button" onClick={() => setStep(1)} className="border-0 h-10 rounded-[9px] px-4 text-sm font-semibold text-muted transition hover:bg-brand-soft hover:text-ink">Atrás</button>
              <Button className="w-full sm:w-auto" onClick={goToReview} disabled={busy}>{busy ? 'Revisando…' : 'Revisar'}</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-semibold text-ink sm:max-w-md">
              Nombre del reparto <span className="font-normal text-muted">(opcional)</span>
              <input
                className="min-h-10 rounded-lg border-0 bg-[#f5f8fd] px-3 text-sm font-normal text-ink-strong ring-1 ring-[#dbe4f0] focus:ring-2 focus:ring-brand"
                value={repartoName}
                maxLength={120}
                placeholder={`Ej. ${base?.name || 'Base'} · lote de revisión`}
                onChange={event => setRepartoName(event.target.value)}
              />
            </label>

            {preview?.errors?.map(text => <Notice key={text} tone="error">{text}</Notice>)}
            {preview?.warnings?.map(text => <Notice key={text} tone="info">{text}</Notice>)}

            {preview?.valid && (
              <>
                <div className={`${t.wrap} md:max-h-[min(320px,45vh)] md:overflow-y-auto`}>
                  <table className={t.table}>
                    <thead className={t.head}>
                      <tr>
                        <th scope="col" className={t.th}>Parte</th>
                        <th scope="col" className={t.th}>Codificador</th>
                        <th scope="col" className={t.th}>Fuente</th>
                        <th scope="col" className={`${t.th} text-right`}>Casos</th>
                      </tr>
                    </thead>
                    <tbody className={t.body}>
                      {preview.lines.map((line, index) => (
                        <tr key={index} className={t.row}>
                          <td data-label="Parte" className={t.cell}><strong className="text-ink-strong">{index + 1}</strong></td>
                          <td data-label="Codificador" className={t.cell}>
                            {line.codificador ? userById.get(String(line.codificador))?.name : <span className="text-muted">Sin asignar</span>}
                          </td>
                          <td data-label="Fuente" className={t.cell}>
                            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">{SOURCE_SHORT[line.fuente]}</span>
                          </td>
                          <td data-label="Casos" className={`${t.cell} tabular-nums md:text-right`}>
                            <strong className="text-ink-strong">{countText(line.casos)}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-sm text-muted">
                  Se crearán <strong className="text-ink-strong">{countText(preview.lines.reduce((sum, line) => sum + line.casos, 0))}</strong> asignaciones
                  {unassigned ? `; ${unassigned} ${unassigned === 1 ? 'parte quedará' : 'partes quedarán'} sin persona` : ''}.
                  Después puedes desactivarlo o, si no tiene decisiones, eliminarlo.
                </p>
              </>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-between">
              <button type="button" onClick={() => setStep(2)} className="border-0 h-10 rounded-[9px] px-4 text-sm font-semibold text-muted transition hover:bg-brand-soft hover:text-ink">Atrás</button>
              <Button className="w-full sm:w-auto" onClick={crear} disabled={busy || !preview?.valid}>{busy ? 'Creando…' : 'Crear reparto'}</Button>
            </div>
          </div>
        )}
      </section>
      )}
    </section>
  );
}
