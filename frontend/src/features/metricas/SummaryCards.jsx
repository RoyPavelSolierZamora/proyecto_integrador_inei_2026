import Panel from '../../shared/ui/Panel.jsx';
import { referenceIsVisible } from './CodingDashboard.jsx';
const number = value => Number(value ?? 0).toLocaleString('es-PE');
const pct = value => value == null ? 'Sin muestra' : (Number(value) * 100).toFixed(1) + ' %';
const interval = value => value ? (value.low * 100).toFixed(1) + ' a ' + (value.high * 100).toFixed(1) + ' %' : '—';
export default function SummaryCards({summary, coding}) {
 const totals = summary.totals, rates = summary.rates, k = coding?.kpis;
 const visible = referenceIsVisible(coding);
 const cards = [
  {label:'Registros', value:number(totals.total), details:[visible ? number(k.matchedWithReference)+' con referencia' : 'Referencia no disponible']},
  {label:'Comparados', value:visible ? number(k.compared) : 'Sin referencia', details:[visible ? number(k.pending)+' sin código' : 'Sin casos comparados', 'Cobertura resuelta: '+pct(rates.resolved)+' · '+number(totals.resolved)+' con código final']},
  {label:'Coincidencia con referencia', value:visible ? pct(k.accuracy) : 'Sin muestra', details:[visible ? 'IC 95 %: '+interval(k.interval) : 'Sin referencia disponible', ...(visible ? [number(k.compared-k.incorrect)+' coinciden · '+number(k.incorrect)+' no coinciden'] : [])]},
  {label:'Necesitan revisión', value:pct(rates.review), details:[number(totals.review)+' registros', 'Cobertura automática: '+pct(rates.automatic)+' · clasificador e IA sobre el total']},
 ];
 return <section aria-label="Indicadores principales" className="grid gap-3">{visible && coding.reference && <p className="text-sm text-muted">Referencia activa: <strong className="text-ink">{coding.reference.name}</strong> · {coding.reference.period} · {number(coding.reference.records)} registros</p>}
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(card=><Panel key={card.label} className="grid content-start gap-1 p-4"><span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{card.label}</span><strong className="text-2xl font-bold leading-tight text-ink-strong md:text-3xl">{card.value}</strong>{card.details.map((detail,index)=><small key={index} className="text-xs leading-relaxed text-muted">{detail}</small>)}</Panel>)}</div>
 {k && <p className="text-xs text-muted">Codificadores: <strong>{number(k.coders)}</strong> · {number(k.humanDecisions)} decisiones humanas</p>}</section>;
}
