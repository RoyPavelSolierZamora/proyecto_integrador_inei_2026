import Panel from '../../shared/ui/Panel.jsx';
import PanelHeading from '../../shared/ui/PanelHeading.jsx';
import { Donut, VerticalBars, chartColors, formatNumber, formatPercent } from '../../shared/ui/Charts.jsx';
import { StackedState, Ranking } from './QualityCharts.jsx';
const pct = value => value == null ? 'Sin muestra' : (Number(value) * 100).toFixed(1) + ' %';
const number = value => Number(value || 0).toLocaleString('es-PE');
const share = (value, total) => total ? Number(value) / Number(total) : 0;
export default function OperationalMetrics({
  summary,
  view,
  hasCoding
}) {
  const t = summary.totals,
    r2 = summary.indicators?.r2,
    r3 = summary.indicators?.r3,
    evaluated = Number(r2?.evaluated || 0);
  const sourceTotal = t.automatic + t.ai + t.human;
  const codes = [...summary.topCodes].sort((a, b) => b.count - a.count).slice(0, 5).map(row => ({
    label: row.code + ' · ' + row.description,
    value: row.count
  }));
  return <div className="grid min-w-0 gap-4">
 {view === 'resumen' && <>

 <div className="grid items-stretch gap-4 xl:grid-cols-2 2xl:grid-cols-3">
 <Panel className="grid grid-rows-[auto_1fr] gap-4 p-5"><PanelHeading title="Estado del procesamiento" description="Cantidad y proporción sobre todos los registros." /><div className="grid min-w-0 content-center"><StackedState total={t.total} items={[{
            label: 'Resueltos',
            value: t.resolved,
            color: '#21836d'
          }, {
            label: 'En revisión',
            value: t.review,
            color: '#c57516'
          }, {
            label: 'Pendientes',
            value: t.pending,
            color: '#8a99ad'
          }]} /></div></Panel>
 <Panel className="grid grid-rows-[auto_1fr] gap-4 p-5"><PanelHeading title="Cómo se resolvió" description="Origen de la última decisión registrada." /><div className="grid min-w-0 content-center">{sourceTotal ? <Donut detailedLegend total={sourceTotal} centerLabel="decisiones" ariaLabel="Origen de resolución" segments={[{
            label: 'Clasificador',
            value: t.automatic,
            color: '#0759bb'
          }, {
            label: 'IA',
            value: t.ai,
            color: '#5a8bbd'
          }, {
            label: 'Persona',
            value: t.human,
            color: '#21836d'
          }]} /> : <p>Sin decisiones registradas.</p>}</div></Panel>
             <Panel className="grid grid-rows-[auto_1fr] gap-4 p-5">
              <PanelHeading title="Confianza del clasificador" description="Distribución operativa; no equivale a exactitud." />
              <div className="grid min-w-0 content-center pt-4"><VerticalBars ariaLabel="Distribución de la confianza del clasificador" footnote={`total n = ${formatNumber(t.total)}`} items={[{
          label: '≥ 0,95',
          value: t.confidenceBands.high,
          color: chartColors.primary
        }, {
          label: '0,90–0,94',
          value: t.confidenceBands.medium,
          color: chartColors.secondary
        }, {
          label: '< 0,90',
          value: t.confidenceBands.low,
          color: chartColors.neutral
        }, ...(t.confidenceBands.missing > 0 ? [{
          label: 'Sin dato',
          value: t.confidenceBands.missing,
          color: chartColors.neutral
        }] : [])].map(item => ({
          label: item.label,
          color: item.color,
          height: share(item.value, t.total),
          display: formatPercent(share(item.value, t.total)),
          detail: `${formatNumber(item.value)} reg.`
        }))} /></div>
            </Panel>
 </div>
 </>}
 {view === 'desempeno' && <>          <Panel className="grid grid-cols-1 gap-4 p-5">
            <PanelHeading title="Calidad evaluada" description="Solo usa registros que también tienen una decisión humana de referencia." />
            {evaluated ? <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[{
            term: 'Casos evaluados',
            value: number(evaluated),
            hint: 'Tamaño real de la muestra'
          }, {
            term: 'Exactitud del clasificador',
            value: pct(r2.accuracy),
            hint: 'Top 1 frente a humano'
          }, {
            term: 'F1 macro del clasificador',
            value: pct(r2.macroF1),
            hint: 'Da igual peso a cada clase'
          }, {
            term: 'Exactitud de la IA',
            value: r3?.evaluated ? pct(r3.accuracy) : 'Sin muestra',
            hint: `${number(r3?.evaluated)} casos evaluados`
          }].map(item => <div key={item.term} className="grid grid-cols-1 gap-0.5 rounded-lg border border-line bg-[#f8fbff] p-4">
                    <dt className="text-xs font-semibold text-muted">{item.term}</dt>
                    <dd className="m-0 text-2xl font-bold text-ink-strong">{item.value}</dd>
                    <small className="text-xs text-muted">{item.hint}</small>
                  </div>)}
              </dl> : <p className="text-sm text-muted">
                Sin muestra de evaluación humana. La cobertura describe cuánto automatiza el sistema, pero no permite afirmar qué tan correcto es.
              </p>}
          </Panel>

</>}
 {view === 'complementario' && <>          <Panel className="grid grid-cols-1 gap-4 p-5">
            <PanelHeading title="Calidad de entrada" description="Campos necesarios antes de interpretar el desempeño." />
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[{
            term: 'P309 completo',
            value: pct(summary.rates.completeness),
            hint: `${number(t.missingP309)} vacíos`
          }, {
            term: 'Contexto incompleto',
            value: number(t.missingContext),
            hint: 'P308 o P308A vacío'
          }, {
            term: 'Clases observadas',
            value: number(t.uniqueCodes),
            hint: 'Con código final'
          }, {
            term: 'Concentración top 5',
            value: pct(summary.rates.topFiveConcentration),
            hint: 'Participación de 5 códigos'
          }].map(item => <div key={item.term} className="grid grid-cols-1 gap-0.5 rounded-lg border border-line bg-[#f8fbff] p-4">
                  <dt className="text-xs font-semibold text-muted">{item.term}</dt>
                  <dd className="m-0 text-2xl font-bold text-ink-strong">{item.value}</dd>
                  <small className="text-xs text-muted">{item.hint}</small>
                </div>)}
            </dl>
          </Panel>

<Panel className="grid gap-4 p-5"><PanelHeading title="Códigos más frecuentes" description="Los cinco códigos más frecuentes; cantidades y porcentajes sobre registros resueltos." /><Ranking rows={codes} total={t.resolved} showColumns />{!codes.length && <p>Sin códigos finales.</p>}</Panel></>}
 </div>;
}
