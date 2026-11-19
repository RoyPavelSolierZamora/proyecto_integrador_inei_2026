import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageHeader from '../../shared/ui/PageHeader.jsx';
import Panel from '../../shared/ui/Panel.jsx';
import Notice from '../../shared/ui/Notice.jsx';
import { buttonClass } from '../../shared/ui/Button.jsx';
import { getMisLoteCasosReal, getMisLotesReal } from '../calidad-codificacion/calidadClient.js';
import { SOURCE_HELP, SOURCE_SHORT } from '../calidad-codificacion/repartoUi.js';

const PAGE = 150;
const countText = value => Number(value || 0).toLocaleString('es-PE');
const percentText = value => `${Number(value || 0).toFixed(1).replace('.', ',')} %`;

function Progress({ value }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-line" role="presentation">
      <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

function LotList() {
  const [data, setData] = useState(null);
  const [message, setMessage] = useState(null);

  // Se actualiza sola cada 20 segundos y al volver a la pestaña, para que una asignación nueva aparezca sin recargar.
  useEffect(() => {
    let cancelled = false;
    const load = () => getMisLotesReal()
      .then(result => { if (!cancelled) { setData(result); setMessage(null); } })
      .catch(error => { if (!cancelled) setMessage({ tone: 'error', text: error.message }); });
    load();
    const timer = setInterval(load, 20000);
    window.addEventListener('focus', load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', load);
    };
  }, []);

  const lots = data?.lots || [];
  const pendingLots = lots.filter(lot => lot.remaining > 0);
  const pendingCases = lots.reduce((sum, lot) => sum + lot.remaining, 0);

  return (
    <section aria-label="Mis lotes" className="grid gap-5">
      <PageHeader icon="clipboard-check" title="Mis lotes" description="Casos que te asignaron para codificar." />
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {data && pendingLots.length > 0 && (
        <Notice tone="info" title={`Tienes ${countText(pendingLots.length)} ${pendingLots.length === 1 ? 'lote' : 'lotes'} por codificar`}>
          Faltan {countText(pendingCases)} casos. Entra a cada lote y codifica los pendientes.
        </Notice>
      )}
      {data && lots.length === 0 && (
        <Panel className="grid gap-2 p-6 text-center">
          <strong className="text-ink-strong">No tienes lotes asignados.</strong>
          <span className="text-sm text-muted">Cuando un supervisor te asigne una base, aparecerá aquí.</span>
        </Panel>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {lots.map(lot => (
          <Panel key={lot.lot} className="grid gap-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <strong className="block truncate text-ink-strong">{lot.baseName}</strong>
                <span className="text-xs text-muted">{lot.period} · {SOURCE_SHORT[lot.fuente]}</span>
              </div>
              <span className={[
                'shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
                lot.remaining > 0 ? 'bg-brand-soft text-brand' : 'bg-[#e4f7ec] text-[#05603a]',
              ].join(' ')}
              >
                {lot.remaining > 0 ? 'Pendiente' : 'Completado'}
              </span>
            </div>
            <p className="text-sm text-muted">{SOURCE_HELP[lot.fuente]}</p>
            <Progress value={lot.percent} />
            <div className="flex items-center justify-between text-sm">
              <span className="tabular-nums text-ink">{countText(lot.decided)} de {countText(lot.assigned)} codificados</span>
              <strong className="tabular-nums text-ink-strong">{percentText(lot.percent)}</strong>
            </div>
            <Link className={buttonClass({ size: 'sm', variant: lot.remaining > 0 ? 'primary' : 'secondary', className: 'justify-self-start' })} to={`/mis-lotes/${lot.lot}`}>
              {lot.remaining > 0 ? 'Codificar' : 'Ver casos'}
            </Link>
          </Panel>
        ))}
      </div>
    </section>
  );
}

function LotDetail({ lote }) {
  const [data, setData] = useState(null);
  const [message, setMessage] = useState(null);
  const [filter, setFilter] = useState('pendientes');
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    setData(null);
    setMessage(null);
    getMisLoteCasosReal(lote)
      .then(setData)
      .catch(error => setMessage({ tone: 'error', text: error.message }));
  }, [lote]);

  const cases = data?.cases || [];
  const total = cases.length;
  const done = cases.filter(item => item.decidido).length;
  const visible = useMemo(() => cases.filter(item => filter === 'todos' || !item.decidido), [cases, filter]);
  const shown = visible.slice(0, limit);

  return (
    <section aria-label="Casos del lote" className="grid gap-5">
      <Link to="/mis-lotes" className="text-sm font-semibold text-brand hover:underline">← Mis lotes</Link>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {data && (
        <>
          <PageHeader
            icon="clipboard-check"
            title={data.lot.datasetName}
            description={`${data.lot.period} · ${SOURCE_SHORT[data.lot.fuente]}. ${SOURCE_HELP[data.lot.fuente]}`}
          />
          <Panel className="grid gap-3 p-5">
            <div className="flex items-center justify-between text-sm">
              <span className="tabular-nums text-ink">{countText(done)} de {countText(total)} codificados</span>
              <strong className="tabular-nums text-ink-strong">{total ? percentText((done / total) * 100) : '0 %'}</strong>
            </div>
            <Progress value={total ? (done / total) * 100 : 0} />
            <div role="group" aria-label="Filtrar casos" className="flex flex-wrap gap-2">
              {[['pendientes', `Pendientes (${countText(total - done)})`], ['todos', `Todos (${countText(total)})`]].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => { setFilter(value); setLimit(PAGE); }}
                  className={[
                    'min-h-9 rounded-full border px-3.5 text-sm font-semibold',
                    filter === value ? 'border-brand bg-brand-soft text-brand' : 'border-[#b9c8cf] bg-white text-ink',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
          </Panel>

          {shown.length === 0 && (
            <Notice tone="success" title="No hay casos pendientes en este lote.">Puedes revisar los casos ya codificados con el filtro «Todos».</Notice>
          )}

          <ul className="grid gap-2">
            {shown.map(item => (
              <li key={item.id} className="grid gap-3 rounded-xl border border-line bg-surface p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="grid min-w-0 gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="tabular-nums text-ink-strong">{item.id}</strong>
                    <span className={[
                      'rounded-full px-2 py-0.5 text-xs font-semibold',
                      item.decidido ? 'bg-[#e4f7ec] text-[#05603a]' : 'bg-brand-soft text-brand',
                    ].join(' ')}
                    >
                      {item.decidido ? 'Codificado' : 'Pendiente'}
                    </span>
                    {item.sugerido && <span className="text-xs text-muted">Sugerido: <strong className="text-ink">{item.sugerido}</strong></span>}
                  </div>
                  <p className="line-clamp-2 break-words text-sm text-ink">{item.p309 || 'Sin texto de actividad'}</p>
                </div>
                <Link
                  className={buttonClass({ size: 'sm', variant: item.decidido ? 'secondary' : 'primary', className: 'justify-self-start md:justify-self-end' })}
                  to={`/casos/${encodeURIComponent(item.id)}?dataset=${data.lot.datasetId}`}
                >
                  {item.decidido ? 'Revisar' : 'Codificar'}
                </Link>
              </li>
            ))}
          </ul>
          {visible.length > shown.length && (
            <button type="button" onClick={() => setLimit(value => value + PAGE)} className={buttonClass({ variant: 'secondary', className: 'justify-self-center' })}>
              Mostrar {countText(Math.min(PAGE, visible.length - shown.length))} más
            </button>
          )}
        </>
      )}
      {!data && !message && <p className="text-sm text-muted">Cargando casos…</p>}
    </section>
  );
}

export default function MisLotesPage() {
  const { lote } = useParams();
  return lote ? <LotDetail lote={lote} /> : <LotList />;
}
