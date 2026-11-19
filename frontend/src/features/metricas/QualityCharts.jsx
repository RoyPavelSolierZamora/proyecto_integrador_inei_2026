import { CompositionLegend, formatNumber, formatPercent } from '../../shared/ui/Charts.jsx';
export function StackedState({
  items,
  total
}) {
  return <figure className="m-0 grid gap-4" aria-label="Estado del procesamiento">
 <div className="flex h-7 overflow-hidden rounded-lg bg-slate-100" aria-hidden="true">{items.map(item => <span key={item.label} style={{
        width: (total ? item.value / total * 100 : 0) + '%',
        background: item.color
      }} />)}</div>
 <CompositionLegend items={items} total={total} label="Estado" /></figure>;
}
export function Ranking({
  rows,
  total = 1,
  percent = false,
  showColumns = false
}) {
  const max = percent ? 1 : Math.max(1, ...rows.map(row => row.value || 0));
  if (showColumns) return <div className="grid gap-3 text-sm"><div className="grid grid-cols-[minmax(0,1fr)_5rem_4rem] gap-x-2 border-b border-line pb-2 text-xs font-bold text-ink-strong"><span>{percent ? 'Origen' : 'Código y actividad'}</span><span className="text-right">{percent ? 'Comparados' : 'Registros'}</span><span className="text-center">%</span></div><ul className="m-0 grid gap-4">{rows.map(row => <li key={row.label} className="grid min-w-0 gap-1"><div className="grid grid-cols-[minmax(0,1fr)_5rem_4rem] items-center gap-x-2"><span className="min-w-0 break-words text-ink">{row.label}</span><strong className="text-right tabular-nums text-ink-strong">{formatNumber(percent ? row.count : row.value)}</strong><span className="text-center font-normal tabular-nums text-muted">{percent ? formatPercent(row.value) : total ? formatPercent(row.value / total) : 'Sin muestra'}</span></div><div className="grid grid-cols-[minmax(0,1fr)_5rem_4rem] gap-x-2"><div className="h-2 rounded bg-slate-100" aria-hidden="true"><div className={percent ? "h-2 rounded bg-[#d9731e]" : "h-2 rounded bg-[#21836d]"} style={{width: Math.max(0, Math.min(100, (row.value || 0) / max * 100)) + '%'}} /></div></div></li>)}</ul></div>;
  return <ul className="m-0 grid gap-4">{rows.map(row => <li key={row.label} className="grid min-w-0 gap-1 text-sm"><div className="flex flex-wrap justify-between gap-x-4 gap-y-1"><span className="break-words text-ink">{row.label}</span><strong className="text-ink-strong">{percent ? formatPercent(row.value) : formatNumber(row.value)}{!percent && total > 0 ? ' · ' + formatPercent(row.value / total) : ''}</strong></div><div className="h-2 rounded bg-slate-100" aria-hidden="true"><div className="h-2 rounded bg-brand" style={{
          width: Math.max(0, (row.value || 0) / max * 100) + '%'
        }} /></div>{row.detail && <small className="text-muted">{row.detail}</small>}</li>)}</ul>;
}
export function AnalystColumns({
  people
}) {
  const max = Math.max(1, ...people.map(p => p.cases));
  return <figure aria-label="Casos por analista" className="m-0 grid gap-3"><div className="flex flex-wrap gap-3 text-xs"><span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-[#21836d]" />Coinciden</span><span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-[#c57516]" />No coinciden</span></div><div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">{people.map(p => <div key={p.id} className="m-0 grid gap-1 text-center text-xs"><strong>{formatNumber(p.cases)} casos</strong><div className="flex h-28 items-end justify-center border-b border-line"><div className="flex w-16 max-w-full flex-col justify-end" style={{
            height: p.cases / max * 100 + '%'
          }}><div style={{
              height: (p.cases ? p.incorrect / p.cases * 100 : 0) + '%',
              background: '#c57516'
            }} /><div style={{
              height: (p.cases ? p.correct / p.cases * 100 : 0) + '%',
              background: '#21836d'
            }} /></div></div><span className="break-all">{p.name}</span><span>{p.cases ? formatPercent(p.correct / p.cases) : 'Sin muestra'} coinciden · {formatNumber(p.incorrect)} no coinciden</span></div>)}</div></figure>;
}
