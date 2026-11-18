import { useEffect, useState } from 'react';
import { createQualityReviewReal, listQualityReviewsReal, searchCatalogReal } from '../../shared/api/dataClient.js';
import Panel from '../../shared/ui/Panel.jsx';
import PanelHeading from '../../shared/ui/PanelHeading.jsx';
import Button from '../../shared/ui/Button.jsx';
import Field, { inputClass } from '../../shared/ui/Field.jsx';

const verdictLabel = { correct: 'Correcto', incorrect: 'Incorrecto y corregido', uncertain: 'Requiere otra revisión' };

// Revisión formal de una decisión. Solo las revisiones registradas cuentan para el error de calidad.
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
    if (verdict !== 'incorrect') {
      setCatalogResults([]);
      return undefined;
    }
    let active = true;
    const timer = setTimeout(() => searchCatalogReal(catalogQuery).then(rows => {
      if (active) setCatalogResults(rows.filter(row => row.codigo !== currentCode).slice(0, 8));
    }).catch(() => { if (active) setCatalogResults([]); }), 180);
    return () => { active = false; clearTimeout(timer); };
  }, [verdict, catalogQuery, currentCode]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await createQualityReviewReal(datasetId, caseId, { verdict, correctedCode, notes });
      setNotes('');
      setCorrectedCode('');
      setCatalogQuery('');
      setVerdict('correct');
      await load();
      await onReviewed?.();
      setMessage('Control de calidad registrado.');
    } catch (error) {
      setMessage(error.message);
    } finally { setSaving(false); }
  }

  return (
    <Panel className="grid grid-cols-1 gap-4 p-5">
      <PanelHeading title="Revisión formal" description="Una tasa de error solo se calcula a partir de estas revisiones registradas." />

      {canReview && (
        <form className="grid grid-cols-1 gap-4" onSubmit={submit}>
          <Field id="calidad-resultado" label="Resultado">
            <select id="calidad-resultado" className={inputClass} value={verdict} onChange={event => setVerdict(event.target.value)}>
              <option value="correct">Decisión correcta</option>
              <option value="incorrect">Decisión incorrecta</option>
              <option value="uncertain">Requiere otra revisión</option>
            </select>
          </Field>

          {verdict === 'incorrect' && (
            <div className="grid grid-cols-1 gap-3">
              <Field id="calidad-codigo" label="Buscar el código correcto">
                <input
                  id="calidad-codigo"
                  type="search"
                  className={inputClass}
                  value={catalogQuery}
                  onChange={event => { setCatalogQuery(event.target.value); setCorrectedCode(''); }}
                  placeholder="Código o descripción CIIU"
                />
              </Field>
              <div role="listbox" aria-label="Códigos para la corrección" className="grid max-h-60 gap-1 overflow-y-auto">
                {catalogResults.map(row => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={correctedCode === row.codigo}
                    key={row.codigo}
                    onClick={() => { setCorrectedCode(row.codigo); setCatalogQuery(`${row.codigo} · ${row.descripcion}`); }}
                    className={['grid grid-cols-[64px_minmax(0,1fr)] gap-2 rounded-lg px-3 py-2 text-left text-sm', correctedCode === row.codigo ? 'bg-brand-soft' : 'hover:bg-[#f5f8fd]'].join(' ')}
                  >
                    <strong className="text-ink-strong">{row.codigo}</strong>
                    <span className="text-muted">{row.descripcion}</span>
                  </button>
                ))}
              </div>
              <small className="text-xs text-muted">{correctedCode ? `Seleccionado: ${correctedCode}` : `Código actual: ${currentCode || 'sin código'}`}</small>
            </div>
          )}

          <Field id="calidad-notas" label="Observación opcional">
            <textarea id="calidad-notas" rows={2} className={inputClass} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Solo si necesitas dejar una precisión" />
          </Field>
          <div>
            <Button type="submit" disabled={saving || (verdict === 'incorrect' && correctedCode.length !== 4)}>
              {saving ? 'Guardando…' : 'Registrar revisión'}
            </Button>
          </div>
        </form>
      )}

      {message && <p role="status" className="text-sm text-muted">{message}</p>}

      {reviews.length > 0 && (
        <ul className="grid grid-cols-1 gap-3">
          {reviews.map(review => (
            <li key={review.id} className="grid grid-cols-1 gap-1 rounded-lg border border-line bg-[#f8fbff] p-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <strong className="text-ink-strong">{verdictLabel[review.verdict]}</strong>
                <span className="text-xs text-muted">{new Date(review.at).toLocaleString('es-PE')}</span>
              </div>
              <p className="text-ink">{review.notes || 'Sin observaciones adicionales.'}</p>
              <small className="text-xs text-muted">{review.reviewer}{review.correctedCode ? ` · Código final ${review.correctedCode}` : ''}</small>
            </li>
          ))}
        </ul>
      )}
      {!reviews.length && <p className="text-sm text-muted">Todavía no existen revisiones formales para este registro.</p>}
    </Panel>
  );
}
