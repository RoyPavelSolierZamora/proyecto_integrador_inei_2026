import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import EpenIcon from './epen/EpenIcon';
import { askAssistantReal } from '../services/dataClient';
import { useAuth } from '../state/AuthContext';
import { useData } from '../state/DataContext';

const pct = value => `${(Number(value || 0) * 100).toFixed(1)} %`;

function AssistantChart({ response }) {
  const data = response?.data;
  if (!data) return null;
  if (response.intent === 'dataset_summary' && data.topCodes?.length) {
    const rows = data.topCodes.slice(0, 6);
    const maximum = Math.max(...rows.map(row => row.count), 1);
    return <section className="assistant-visual" aria-label="Códigos más frecuentes"><h3>Códigos más frecuentes</h3>{rows.map(row => <div className="assistant-bar" key={row.code}><span><strong>{row.code}</strong><small title={row.description}>{row.description}</small></span><i><b style={{ width: `${row.count / maximum * 100}%` }} /></i><strong>{row.count}</strong></div>)}</section>;
  }
  if (response.intent === 'compare_datasets' && data.codeChanges?.length) {
    return <section className="assistant-visual assistant-comparison" aria-label="Cambios principales"><header><h3>Cambios principales</h3><div><span>{data.left.dataset.period}</span><span>{data.right.dataset.period}</span></div></header>{data.codeChanges.slice(0, 6).map(row => <article key={row.code}><div><strong>{row.code}</strong><span title={row.description}>{row.description}</span></div><div className="assistant-pair"><span style={{ '--value': `${Math.max(2, row.leftShare * 100)}%` }}>{pct(row.leftShare)}</span><span style={{ '--value': `${Math.max(2, row.rightShare * 100)}%` }}>{pct(row.rightShare)}</span></div><b className={row.change > 0 ? 'is-up' : row.change < 0 ? 'is-down' : ''}>{row.change > 0 ? '+' : ''}{(row.change * 100).toFixed(1)} pp</b></article>)}</section>;
  }
  if (response.intent === 'quality_control' && data.coders?.some(row => row.reviewed)) {
    const rows = data.coders.filter(row => row.reviewed).slice(0, 6);
    return <section className="assistant-visual" aria-label="Error confirmado sobre revisados"><h3>Error confirmado</h3>{rows.map(row => <div className="assistant-bar" key={row.id}><span><strong>{row.name}</strong><small>{row.reviewed} revisados</small></span><i><b className="is-quality" style={{ width: `${Number(row.errorRate || 0) * 100}%` }} /></i><strong>{pct(row.errorRate)}</strong></div>)}</section>;
  }
  if (response.intent === 'variable_profile' && data.contexts?.length) {
    const rows = data.contexts.slice(0, 6);
    const maximum = Math.max(...rows.map(row => row.count), 1);
    return <section className="assistant-visual" aria-label="Cruce de ocupación y actividad"><h3>Contextos ocupacionales</h3>{rows.map(row => <div className="assistant-bar" key={row.occupation}><span><strong title={row.occupation}>{row.occupation}</strong><small>{row.dominantCode ? `Código frecuente ${row.dominantCode}` : 'Sin código final'}</small></span><i><b style={{ width: `${row.count / maximum * 100}%` }} /></i><strong>{row.count}</strong></div>)}</section>;
  }
  return null;
}

function downloadComparison(response) {
  if (response?.intent !== 'compare_datasets' || !response.data?.codeChanges?.length) return;
  const rows = [['codigo', 'descripcion', 'primera_base', 'segunda_base', 'variacion_pp'], ...response.data.codeChanges.map(row => [row.code, row.description, row.leftShare, row.rightShare, (row.change * 100).toFixed(2)])];
  const csv = rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'comparacion_epen.csv'; link.click(); URL.revokeObjectURL(url);
}

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
    setQuestion(''); setLoading(true);
    try {
      const response = await askAssistantReal({ question: value, datasetId: datasetId || null, compareDatasetId: compareDatasetId || null, caseExternalId });
      setMessages(current => [...current, { role: 'assistant', text: response.answer, meta: response }]);
    } catch (error) { setMessages(current => [...current, { role: 'assistant', text: error.message, error: true }]); }
    finally { setLoading(false); }
  }

  async function copyAnswer(text, index) {
    await navigator.clipboard.writeText(text);
    setCopied(index); setTimeout(() => setCopied(null), 1400);
  }

  const suggestions = [
    ...(analytical ? [{ label: 'Resumir base', question: 'Resume esta base' }] : []),
    ...(analytical ? [{ label: 'Cruzar variables', question: 'Cruza actividad, ocupación y tareas de esta base' }] : []),
    ...(elevated ? [{ label: 'Comparar periodos', question: 'Compara las dos bases seleccionadas', disabled: !compareDatasetId }, { label: 'Revisar calidad', question: '¿Qué indicadores de control de calidad tiene esta base?' }] : []),
    ...(caseExternalId ? [{ label: 'Buscar antecedentes', question: '¿Cómo se clasificaron observaciones similares en otros años?' }] : []),
    { label: 'Ayuda de uso', question: '¿Cómo reviso y confirmo un código?' },
  ];

  return <section className={`assistant-workspace ${compact ? 'assistant-workspace--compact' : ''}`} aria-label="Asistente del sistema">
    <header className="assistant-header"><div><span className="assistant-mark" aria-hidden="true"><EpenIcon name="chat-dots" /></span><div><strong>Asistente EPEN</strong><small>Ayuda y análisis autorizado</small></div></div><div>{messages.length > 0 && <button type="button" className="button button--quiet" onClick={() => setMessages([])}>Nueva consulta</button>}{onClose && <button type="button" className="button button--quiet" onClick={onClose} aria-label="Cerrar asistente"><EpenIcon name="x-lg" /></button>}</div></header>
    {compact && analytical && <details className="assistant-compact-context">
      <summary><span>Contexto</span><small>{datasets.find(item => String(item.id) === String(datasetId))?.period || 'Seleccionar base'}{elevated && compareDatasetId ? ' · comparación lista' : ''}</small></summary>
      <div>
        <label>Base principal<select value={datasetId} onChange={event => setDatasetId(event.target.value)}><option value="">Sin base</option>{datasets.map(item => <option key={item.id} value={item.id}>{item.name} · {item.period} · v{item.version}</option>)}</select></label>
        {elevated && <label>Comparar con<select value={compareDatasetId} onChange={event => setCompareDatasetId(event.target.value)}><option value="">No comparar</option>{datasets.filter(item => String(item.id) !== String(datasetId)).map(item => <option key={item.id} value={item.id}>{item.name} · {item.period} · v{item.version}</option>)}</select></label>}
      </div>
    </details>}
    <div className="assistant-body">
      {analytical && <aside className="assistant-context" aria-label="Contexto de la consulta"><h2>Contexto</h2><label>Base principal<select value={datasetId} onChange={event => setDatasetId(event.target.value)}><option value="">Sin base</option>{datasets.map(item => <option key={item.id} value={item.id}>{item.name} · {item.period} · v{item.version}</option>)}</select></label>{elevated && <label>Comparar con<select value={compareDatasetId} onChange={event => setCompareDatasetId(event.target.value)}><option value="">No comparar</option>{datasets.filter(item => String(item.id) !== String(datasetId)).map(item => <option key={item.id} value={item.id}>{item.name} · {item.period} · v{item.version}</option>)}</select></label>}{caseExternalId && <p>Registro <strong>{caseExternalId}</strong></p>}<small>Las consultas usan rutas autorizadas; no ejecutan SQL libre.</small></aside>}
      <div className="assistant-conversation">
        {!messages.length && <div className="assistant-empty"><span className="assistant-empty__icon"><EpenIcon name="chat-dots" /></span><h2>¿Qué necesitas revisar?</h2><p>Elige una tarea o escribe una pregunta sobre la base seleccionada.</p><div className="assistant-tasks">{suggestions.map(item => <button type="button" key={item.label} disabled={item.disabled} onClick={() => send(item.question)}>{item.label}<EpenIcon name="arrow-right" /></button>)}</div></div>}
        <div className="assistant-messages" aria-live="polite">{messages.map((message, index) => <article className={`assistant-message assistant-message--${message.role}${message.error ? ' assistant-message--error' : ''}`} key={`${message.role}-${index}`}><p>{message.text}</p><AssistantChart response={message.meta} />{message.role === 'assistant' && !message.error && <footer><button type="button" onClick={() => copyAnswer(message.text, index)}>{copied === index ? 'Copiado' : 'Copiar respuesta'}</button>{message.meta?.intent === 'compare_datasets' && <button type="button" onClick={() => downloadComparison(message.meta)}>Descargar comparación</button>}<time>{message.meta ? new Date(message.meta.calculatedAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : ''}</time></footer>}</article>)}{loading && <article className="assistant-message assistant-message--assistant" role="status"><p>Calculando respuesta…</p></article>}<div ref={endRef} /></div>
        <form className="assistant-composer" onSubmit={event => { event.preventDefault(); send(); }}><label className="sr-only" htmlFor={compact ? 'assistant-question-compact' : 'assistant-question'}>Pregunta</label><textarea id={compact ? 'assistant-question-compact' : 'assistant-question'} rows={2} maxLength={800} value={question} onChange={event => setQuestion(event.target.value)} placeholder="Pregunta sobre el sistema o la base seleccionada" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} /><button className="button button--primary" disabled={loading || question.trim().length < 3} aria-label="Enviar pregunta"><EpenIcon name="send" /><span>Enviar</span></button></form>
      </div>
    </div>
    {compact && <footer className="assistant-footer"><Link to="/asistente" onClick={onClose}>Abrir análisis completo</Link><span>Enter para enviar</span></footer>}
  </section>;
}
