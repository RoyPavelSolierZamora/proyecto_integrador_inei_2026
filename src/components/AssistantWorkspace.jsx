import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { askAssistantReal } from '../services/dataClient';
import { useAuth } from '../state/AuthContext';
import { useData } from '../state/DataContext';

const pct = value => `${(Number(value || 0) * 100).toFixed(1)} %`;

function AssistantChart({ response }) {
  const data = response?.data;
  if (!data) return null;
  if (response.intent === 'dataset_summary' && data.topCodes?.length) {
    const rows = data.topCodes.slice(0, 5);
    const maximum = Math.max(...rows.map(row => row.count), 1);
    return <figure className="assistant-chart"><figcaption>Códigos más frecuentes</figcaption>{rows.map(row => <div className="assistant-bar" key={row.code}><span>{row.code}</span><i><b style={{ width: `${Math.max(3, row.count / maximum * 100)}%` }} /></i><strong>{row.count}</strong></div>)}</figure>;
  }
  if (response.intent === 'compare_datasets' && data.codeChanges?.length) {
    return <figure className="assistant-chart"><figcaption>Distribución comparada</figcaption>{data.codeChanges.slice(0, 5).map(row => <div className="assistant-compare-bar" key={row.code}><strong>{row.code}</strong><div><i style={{ width: `${Math.max(2, row.leftShare * 100)}%` }} /><span>{pct(row.leftShare)}</span></div><div><i style={{ width: `${Math.max(2, row.rightShare * 100)}%` }} /><span>{pct(row.rightShare)}</span></div></div>)}<footer><span>Primera base</span><span>Segunda base</span></footer></figure>;
  }
  if (response.intent === 'quality_control' && data.coders?.some(row => row.reviewed)) {
    return <figure className="assistant-chart"><figcaption>Error confirmado sobre revisados</figcaption>{data.coders.filter(row => row.reviewed).slice(0, 5).map(row => <div className="assistant-bar" key={row.id}><span title={row.name}>{row.name}</span><i><b className="assistant-bar--quality" style={{ width: `${Math.max(2, Number(row.errorRate || 0) * 100)}%` }} /></i><strong>{pct(row.errorRate)}</strong></div>)}</figure>;
  }
  return null;
}

export default function AssistantWorkspace({ compact = false, caseExternalId = null, onClose }) {
  const { user } = useAuth();
  const { datasets, activeDataset } = useData();
  const elevated = ['supervisor', 'auditor', 'admin'].includes(user.role);
  const analytical = ['analista', 'supervisor', 'auditor', 'admin'].includes(user.role);
  const [datasetId, setDatasetId] = useState(activeDataset?.id || '');
  const [compareDatasetId, setCompareDatasetId] = useState('');
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([{ role: 'assistant', text: analytical
    ? 'Pregunta por esta base o elige una consulta rápida.'
    : 'Pregunta cómo cargar, revisar o exportar una base.' }]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages, loading]);
  useEffect(() => { if (!datasetId && activeDataset?.id) setDatasetId(activeDataset.id); }, [activeDataset?.id]);

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

  const suggestions = [
    { label: 'Confirmar un código', question: '¿Cómo reviso y confirmo un código?' },
    ...(analytical ? [{ label: 'Resumen de la base', question: 'Resume esta base' }, ...(caseExternalId ? [{ label: 'Casos similares', question: '¿Cómo se clasificaron observaciones similares en otros años?' }] : [])] : []),
    ...(elevated ? [{ label: 'Comparar bases', question: 'Compara las dos bases seleccionadas' }, { label: 'Control de calidad', question: '¿Qué indicadores de control de calidad tiene esta base?' }] : []),
  ];

  return <section className={`assistant-workspace ${compact ? 'assistant-workspace--compact' : ''}`} aria-label="Asistente del sistema">
    <header><div><span className="assistant-mark" aria-hidden="true">IA</span><div><strong>Asistente EPEN</strong><small>Respuestas calculadas y ayuda de uso</small></div></div>{onClose && <button type="button" className="button button--quiet" onClick={onClose} aria-label="Cerrar asistente">Cerrar</button>}</header>
    {analytical && <details className="assistant-settings" open={!compact ? true : undefined}><summary><span>Contexto</span><small>{datasets.find(item => String(item.id) === String(datasetId))?.period || 'Sin base'}</small></summary><div className="assistant-context">
      <label>Base<select value={datasetId} onChange={event => setDatasetId(event.target.value)}><option value="">Sin base</option>{datasets.map(item => <option key={item.id} value={item.id}>{item.name} · {item.period} · v{item.version}</option>)}</select></label>
      {elevated && <label>Comparar con<select value={compareDatasetId} onChange={event => setCompareDatasetId(event.target.value)}><option value="">No comparar</option>{datasets.filter(item => String(item.id) !== String(datasetId)).map(item => <option key={item.id} value={item.id}>{item.name} · {item.period} · v{item.version}</option>)}</select></label>}
      {caseExternalId && <p>Registro: <strong>{caseExternalId}</strong></p>}
    </div></details>}
    <div className="assistant-suggestions" aria-label="Preguntas sugeridas"><span>Prueba con</span><div>{suggestions.map(item => <button type="button" key={item.label} onClick={() => send(item.question)}>{item.label}</button>)}</div></div>
    <div className="assistant-messages" aria-live="polite">{messages.map((message, index) => <article className={`assistant-message assistant-message--${message.role}${message.error ? ' assistant-message--error' : ''}`} key={`${message.role}-${index}`}><span>{message.role === 'assistant' ? 'Asistente' : 'Tú'}</span><p>{message.text}</p><AssistantChart response={message.meta} />{message.meta && <small>Calculado {new Date(message.meta.calculatedAt).toLocaleString('es-PE')}</small>}</article>)}{loading && <article className="assistant-message assistant-message--assistant" role="status"><span>Asistente</span><p>Consultando…</p></article>}<div ref={endRef} /></div>
    <form className="assistant-composer" onSubmit={event => { event.preventDefault(); send(); }}><label className="sr-only" htmlFor={compact ? 'assistant-question-compact' : 'assistant-question'}>Pregunta</label><textarea id={compact ? 'assistant-question-compact' : 'assistant-question'} rows={compact ? 2 : 3} maxLength={800} value={question} onChange={event => setQuestion(event.target.value)} placeholder="Pregunta sobre el sistema o los datos procesados" /><button className="button button--primary" disabled={loading || question.trim().length < 3}>Enviar</button></form>
    {compact && <footer><Link to="/asistente" onClick={onClose}>Abrir análisis completo</Link><span>El asistente no ejecuta SQL libre.</span></footer>}
  </section>;
}
