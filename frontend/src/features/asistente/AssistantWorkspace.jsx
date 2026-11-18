import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import EpenIcon from '../../shared/ui/EpenIcon.jsx';
import Button from '../../shared/ui/Button.jsx';
import { inputClass } from '../../shared/ui/Field.jsx';
import { askAssistantReal } from '../../shared/api/dataClient.js';
import { useAuth } from '../../app/state/AuthContext.jsx';
import { useData } from '../../app/state/DataContext.jsx';

const pct = value => `${(Number(value || 0) * 100).toFixed(1)} %`;

// Fila de barra con etiqueta, valor y relleno proporcional.
function Bar({ label, detail, value, max, tone = 'bg-brand', display }) {
  const width = max ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
      <span className="grid min-w-0">
        <strong className="truncate text-ink-strong" title={label}>{label}</strong>
        {detail && <small className="truncate text-xs text-muted">{detail}</small>}
      </span>
      <strong className="text-ink-strong">{display ?? value}</strong>
      <span className="col-span-2 h-2 overflow-hidden rounded-full bg-line">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${width}%` }} />
      </span>
    </div>
  );
}

// Gráficos que la respuesta del asistente puede incluir. Cada uno se muestra solo si hay datos.
function AssistantChart({ response }) {
  const data = response?.data;
  if (!data) return null;

  if (response.intent === 'dataset_summary' && data.topCodes?.length) {
    const rows = data.topCodes.slice(0, 6);
    const maximum = Math.max(...rows.map(row => row.count), 1);
    return (
      <section aria-label="Códigos más frecuentes" className="grid gap-3 rounded-xl border border-line bg-[#f8fbff] p-3">
        <h3 className="text-sm font-bold text-ink-strong">Códigos más frecuentes</h3>
        {rows.map(row => <Bar key={row.code} label={`${row.code} · ${row.description}`} value={row.count} max={maximum} />)}
      </section>
    );
  }

  if (response.intent === 'compare_datasets' && data.codeChanges?.length) {
    return (
      <section aria-label="Cambios principales" className="grid gap-3 rounded-xl border border-line bg-[#f8fbff] p-3">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-bold text-ink-strong">Cambios principales</h3>
          <div className="flex gap-3 text-xs text-muted"><span>{data.left.dataset.period}</span><span>{data.right.dataset.period}</span></div>
        </header>
        {data.codeChanges.slice(0, 6).map(row => (
          <article key={row.code} className="grid gap-1.5 border-t border-line pt-2 first:border-0 first:pt-0">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0"><strong className="text-ink-strong">{row.code}</strong> <span className="truncate text-muted" title={row.description}>{row.description}</span></span>
              <b className={['shrink-0 text-xs', row.change > 0 ? 'text-[#05603a]' : row.change < 0 ? 'text-danger' : 'text-muted'].join(' ')}>
                {row.change > 0 ? '+' : ''}{(row.change * 100).toFixed(1)} pp
              </b>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted">
              <span>{pct(row.leftShare)}</span>
              <span className="text-right">{pct(row.rightShare)}</span>
            </div>
          </article>
        ))}
      </section>
    );
  }

  if (response.intent === 'quality_control' && data.coders?.some(row => row.reviewed)) {
    const rows = data.coders.filter(row => row.reviewed).slice(0, 6);
    return (
      <section aria-label="Error confirmado sobre revisados" className="grid gap-3 rounded-xl border border-line bg-[#f8fbff] p-3">
        <h3 className="text-sm font-bold text-ink-strong">Error confirmado</h3>
        {rows.map(row => (
          <Bar key={row.id} label={row.name} detail={`${row.reviewed} revisados`} value={Number(row.errorRate || 0) * 100} max={100} tone="bg-danger" display={pct(row.errorRate)} />
        ))}
      </section>
    );
  }

  if (response.intent === 'variable_profile' && data.contexts?.length) {
    const rows = data.contexts.slice(0, 6);
    const maximum = Math.max(...rows.map(row => row.count), 1);
    return (
      <section aria-label="Cruce de ocupación y actividad" className="grid gap-3 rounded-xl border border-line bg-[#f8fbff] p-3">
        <h3 className="text-sm font-bold text-ink-strong">Contextos ocupacionales</h3>
        {rows.map(row => (
          <Bar key={row.occupation} label={row.occupation} detail={row.dominantCode ? `Código frecuente ${row.dominantCode}` : 'Sin código final'} value={row.count} max={maximum} />
        ))}
      </section>
    );
  }
  return null;
}

function downloadComparison(response) {
  if (response?.intent !== 'compare_datasets' || !response.data?.codeChanges?.length) return;
  const rows = [
    ['codigo', 'descripcion', 'primera_base', 'segunda_base', 'variacion_pp'],
    ...response.data.codeChanges.map(row => [row.code, row.description, row.leftShare, row.rightShare, (row.change * 100).toFixed(2)]),
  ];
  const csv = rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'comparacion_epen.csv';
  link.click();
  URL.revokeObjectURL(url);
}

// Selectores de base principal y de comparación. Se reutilizan en la vista completa y en el diálogo.
function DatasetSelects({ datasets, datasetId, setDatasetId, compareDatasetId, setCompareDatasetId, elevated, id }) {
  const others = datasets.filter(item => String(item.id) !== String(datasetId));
  return (
    <div className="grid gap-3">
      <label className="grid gap-1 text-sm font-semibold text-ink" htmlFor={`${id}-base`}>
        Base principal
        <select id={`${id}-base`} className={inputClass} value={datasetId} onChange={event => setDatasetId(event.target.value)}>
          <option value="">Sin base</option>
          {datasets.map(item => <option key={item.id} value={item.id}>{item.name} · {item.period} · v{item.version}</option>)}
        </select>
      </label>
      {elevated && (
        <label className="grid gap-1 text-sm font-semibold text-ink" htmlFor={`${id}-comparar`}>
          Comparar con
          <select id={`${id}-comparar`} className={inputClass} value={compareDatasetId} onChange={event => setCompareDatasetId(event.target.value)}>
            <option value="">No comparar</option>
            {others.map(item => <option key={item.id} value={item.id}>{item.name} · {item.period} · v{item.version}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

// Conversación del asistente. Modo compacto para el panel flotante; modo completo para la página.
export default function AssistantWorkspace({ compact = false, caseExternalId = null, onClose }) {
  const { user } = useAuth();
  const { datasets, activeDataset } = useData();
  const elevated = ['supervisor', 'auditor', 'admin'].includes(user.role);
  const analytical = ['analista', 'supervisor', 'auditor', 'admin'].includes(user.role);
  const [datasetId, setDatasetId] = useState(activeDataset?.id || '');
  const [compareDatasetId, setCompareDatasetId] = useState('');
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(null);
  const endRef = useRef(null);
  const inputId = compact ? 'asistente-pregunta-compacta' : 'asistente-pregunta';

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages, loading]);
  useEffect(() => { if (!datasetId && activeDataset?.id) setDatasetId(activeDataset.id); }, [activeDataset?.id]);
  useEffect(() => {
    if (!elevated || datasets.length < 2 || (compareDatasetId && String(compareDatasetId) !== String(datasetId))) return;
    const alternative = datasets.find(item => String(item.id) !== String(datasetId));
    if (alternative) setCompareDatasetId(alternative.id);
  }, [datasets, datasetId, compareDatasetId, elevated]);

  async function send(text = question) {
    const value = String(text || '').trim();
    if (value.length < 3 || loading) return;
    setMessages(current => [...current, { role: 'user', text: value }]);
    setQuestion('');
    setLoading(true);
    try {
      const response = await askAssistantReal({ question: value, datasetId: datasetId || null, compareDatasetId: compareDatasetId || null, caseExternalId });
      setMessages(current => [...current, { role: 'assistant', text: response.answer, meta: response }]);
    } catch (error) {
      setMessages(current => [...current, { role: 'assistant', text: error.message, error: true }]);
    } finally { setLoading(false); }
  }

  async function copyAnswer(text, index) {
    await navigator.clipboard.writeText(text);
    setCopied(index);
    setTimeout(() => setCopied(null), 1400);
  }

  const suggestions = [
    ...(analytical ? [{ label: 'Resumir base', question: 'Resume esta base' }] : []),
    ...(analytical ? [{ label: 'Cruzar variables', question: 'Cruza actividad, ocupación y tareas de esta base' }] : []),
    ...(elevated ? [
      { label: 'Comparar periodos', question: 'Compara las dos bases seleccionadas', disabled: !compareDatasetId },
      { label: 'Revisar calidad', question: '¿Qué indicadores de control de calidad tiene esta base?' },
    ] : []),
    ...(caseExternalId ? [{ label: 'Buscar antecedentes', question: '¿Cómo se clasificaron observaciones similares en otros años?' }] : []),
    { label: 'Ayuda de uso', question: '¿Cómo reviso y confirmo un código?' },
  ];

  const selectsProps = { datasets, datasetId, setDatasetId, compareDatasetId, setCompareDatasetId, elevated };
  const currentPeriod = datasets.find(item => String(item.id) === String(datasetId))?.period;

  return (
    <section aria-label="Asistente del sistema" className={['flex min-h-0 flex-col bg-surface', compact ? 'max-h-[min(620px,calc(100vh-120px))]' : 'h-full min-h-[70vh] rounded-2xl border border-line'].join(' ')}>
      <header className="flex items-center justify-between gap-3 border-b border-line p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="grid size-10 flex-none place-items-center rounded-xl bg-brand-soft text-brand"><EpenIcon name="chat-dots" /></span>
          <div className="min-w-0">
            <strong className="block text-sm text-ink-strong">Asistente EPEN</strong>
            <small className="block text-xs text-muted">Ayuda y análisis autorizado</small>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && <Button variant="quiet" size="sm" onClick={() => setMessages([])}>Nueva consulta</Button>}
          {onClose && <Button variant="quiet" size="icon" onClick={onClose} aria-label="Cerrar asistente"><EpenIcon name="x-lg" /></Button>}
        </div>
      </header>

      {analytical && (
        <details className={['group border-b border-line px-4 py-2 text-sm', compact ? '' : 'md:hidden'].join(' ')}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold text-ink-strong">
            <span>Contexto</span>
            <small className="text-xs font-normal text-muted">{currentPeriod || 'Seleccionar base'}{elevated && compareDatasetId ? ' · comparación lista' : ''}</small>
          </summary>
          <div className="mt-3"><DatasetSelects {...selectsProps} id="ctx-compacto" /></div>
        </details>
      )}

      <div className={['grid min-h-0 flex-1', !compact && analytical ? 'md:grid-cols-[240px_minmax(0,1fr)]' : ''].join(' ')}>
        {!compact && analytical && (
          <aside aria-label="Contexto de la consulta" className="hidden grid-rows-[auto_1fr] gap-3 overflow-y-auto border-r border-line bg-[#f8fbff] p-4 md:grid">
            <div className="grid content-start gap-3">
              <h2 className="text-sm font-bold text-ink-strong">Contexto</h2>
              <DatasetSelects {...selectsProps} id="ctx-completo" />
              {caseExternalId && <p className="text-sm text-muted">Registro <strong className="text-ink-strong">{caseExternalId}</strong></p>}
            </div>
            <small className="text-xs text-muted">Las consultas usan rutas autorizadas; no ejecutan SQL libre.</small>
          </aside>
        )}

        <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]">
          <div className="grid min-h-0 content-start gap-4 overflow-y-auto p-4" aria-live="polite">
            {!messages.length && (
              <div className="grid justify-items-center gap-3 py-6 text-center">
                <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand"><EpenIcon name="chat-dots" /></span>
                <h2 className="text-base font-bold text-ink-strong">¿Qué necesitas revisar?</h2>
                <p className="max-w-sm text-sm text-muted">Elige una tarea o escribe una pregunta sobre la base seleccionada.</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {suggestions.map(item => (
                    <button
                      type="button"
                      key={item.label}
                      disabled={item.disabled}
                      onClick={() => send(item.question)}
                      className="inline-flex items-center gap-2 rounded-full border border-[#b9c8cf] bg-white px-3 py-1.5 text-sm font-semibold text-navy hover:bg-brand-soft disabled:opacity-50"
                    >
                      {item.label}
                      <EpenIcon name="arrow-right" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                className={[
                  'grid max-w-[92%] gap-3 rounded-2xl p-3 text-sm leading-relaxed',
                  message.role === 'user' ? 'ml-auto bg-brand text-white' : message.error ? 'bg-danger-soft text-danger' : 'bg-[#f5f8fd] text-ink',
                ].join(' ')}
              >
                <p className="whitespace-pre-line">{message.text}</p>
                <AssistantChart response={message.meta} />
                {message.role === 'assistant' && !message.error && (
                  <footer className="flex flex-wrap items-center gap-3 text-xs text-muted">
                    <button type="button" className="font-semibold text-brand hover:underline" onClick={() => copyAnswer(message.text, index)}>
                      {copied === index ? 'Copiado' : 'Copiar respuesta'}
                    </button>
                    {message.meta?.intent === 'compare_datasets' && (
                      <button type="button" className="font-semibold text-brand hover:underline" onClick={() => downloadComparison(message.meta)}>Descargar comparación</button>
                    )}
                    {message.meta && <time>{new Date(message.meta.calculatedAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</time>}
                  </footer>
                )}
              </article>
            ))}
            {loading && <p role="status" className="rounded-2xl bg-[#f5f8fd] p-3 text-sm text-muted">Calculando respuesta…</p>}
            <div ref={endRef} />
          </div>

          <form
            className="grid gap-2 border-t border-line p-3"
            onSubmit={event => { event.preventDefault(); send(); }}
          >
            <label htmlFor={inputId} className="sr-only">Pregunta</label>
            <div className="flex items-end gap-2">
              <textarea
                id={inputId}
                rows={2}
                maxLength={800}
                value={question}
                onChange={event => setQuestion(event.target.value)}
                placeholder="Pregunta sobre el sistema o la base seleccionada"
                onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }}
                className="min-h-11 flex-1 resize-none rounded-[9px] border border-[#b9c8cf] px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-brand"
              />
              <Button type="submit" disabled={loading || question.trim().length < 3} aria-label="Enviar pregunta">
                <EpenIcon name="send" />
                <span>Enviar</span>
              </Button>
            </div>
          </form>
        </div>
      </div>

      {compact && (
        <footer className="flex items-center justify-between gap-3 border-t border-line px-4 py-2 text-xs text-muted">
          <Link to="/asistente" onClick={onClose} className="font-semibold text-brand hover:underline">Abrir análisis completo</Link>
          <span>Enter para enviar</span>
        </footer>
      )}
    </section>
  );
}
