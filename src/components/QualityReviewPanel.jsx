import { useEffect, useState } from 'react';
import { createQualityReviewReal, listQualityReviewsReal } from '../services/dataClient';
import { searchCatalogReal } from '../services/dataClient';

const verdictLabel = { correct: 'Correcto', incorrect: 'Incorrecto y corregido', uncertain: 'Requiere otra revisión' };

export default function QualityReviewPanel({ datasetId, caseId, currentCode, canReview, onReviewed }) {
  const [reviews, setReviews] = useState([]);
  const [verdict, setVerdict] = useState('correct');
  const [correctedCode, setCorrectedCode] = useState('');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogResults, setCatalogResults] = useState([]);
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const result = await listQualityReviewsReal(datasetId, caseId);
    setReviews(result.reviews || []);
  }
  useEffect(() => { load().catch(error => setMessage(error.message)); }, [datasetId, caseId]);
  useEffect(() => {
    if (verdict !== 'incorrect') return setCatalogResults([]);
    let active = true;
    const timer = setTimeout(() => searchCatalogReal(catalogQuery).then(rows => {
      if (active) setCatalogResults(rows.filter(row => row.codigo !== currentCode).slice(0, 8));
    }).catch(() => { if (active) setCatalogResults([]); }), 180);
    return () => { active = false; clearTimeout(timer); };
  }, [verdict, catalogQuery, currentCode]);

  async function submit(event) {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      await createQualityReviewReal(datasetId, caseId, { verdict, correctedCode, notes });
      setNotes(''); setCorrectedCode(''); setCatalogQuery(''); setVerdict('correct');
      await load(); await onReviewed?.();
      setMessage('Control de calidad registrado.');
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }

  return <section className="panel panel--wide quality-review-panel">
    <div className="panel-heading"><div><p className="eyebrow">Control de calidad</p><h2>Revisión formal</h2><p>Una tasa de error solo se calcula a partir de estas revisiones registradas.</p></div></div>
    {canReview && <form className="quality-review-form" onSubmit={submit}>
      <label>Resultado<select value={verdict} onChange={event => setVerdict(event.target.value)}><option value="correct">Decisión correcta</option><option value="incorrect">Decisión incorrecta</option><option value="uncertain">Requiere otra revisión</option></select></label>
      {verdict === 'incorrect' && <div className="quality-correction-picker"><label>Buscar el código correcto<input type="search" value={catalogQuery} onChange={event => { setCatalogQuery(event.target.value); setCorrectedCode(''); }} placeholder="Código o descripción CIIU" /></label><div className="catalog-results" role="listbox" aria-label="Códigos para la corrección">{catalogResults.map(row => <button type="button" role="option" aria-selected={correctedCode === row.codigo} className={correctedCode === row.codigo ? 'catalog-result--selected' : ''} key={row.codigo} onClick={() => { setCorrectedCode(row.codigo); setCatalogQuery(`${row.codigo} · ${row.descripcion}`); }}><strong>{row.codigo}</strong><span>{row.descripcion}</span></button>)}</div><small>{correctedCode ? `Seleccionado: ${correctedCode}` : `Código actual: ${currentCode || 'sin código'}`}</small></div>}
      <label className="quality-review-notes">Observación opcional<textarea rows={2} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Solo si necesitas dejar una precisión" /></label>
      <button className="button button--primary" disabled={saving || (verdict === 'incorrect' && correctedCode.length !== 4)}>{saving ? 'Guardando…' : 'Registrar revisión'}</button>
    </form>}
    {message && <p className="helper-text" role="status">{message}</p>}
    <div className="quality-review-list">{reviews.map(review => <article key={review.id}><div><strong>{verdictLabel[review.verdict]}</strong><span>{new Date(review.at).toLocaleString('es-PE')}</span></div><p>{review.notes || 'Sin observaciones adicionales.'}</p><small>{review.reviewer}{review.correctedCode ? ` · Código final ${review.correctedCode}` : ''}</small></article>)}</div>
    {!reviews.length && <p className="empty-state empty-state--compact">Todavía no existen revisiones formales para este registro.</p>}
  </section>;
}
