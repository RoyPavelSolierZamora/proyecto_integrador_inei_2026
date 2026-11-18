import { useEffect, useState } from 'react';
import { getSimilarCasesReal } from '../../shared/api/dataClient.js';

export default function SimilarCasesPanel({ datasetId, caseId }) {
  const [state, setState] = useState({ loading: true, rows: [], error: '' });

  useEffect(() => {
    let active = true;
    setState({ loading: true, rows: [], error: '' });
    getSimilarCasesReal(datasetId, caseId)
      .then(result => { if (active) setState({ loading: false, rows: result.rows || [], error: '' }); })
      .catch(error => { if (active) setState({ loading: false, rows: [], error: error.message }); });
    return () => { active = false; };
  }, [datasetId, caseId]);

  return <section className="panel panel--wide similar-cases-panel">
    <div className="panel-heading"><div><p className="eyebrow">Antecedentes operacionales</p><h2>Cómo se clasificaron observaciones relacionadas</h2><p>Resultados recuperados de otras bases cargadas. Son referencias, no reglas automáticas.</p></div></div>
    {state.loading && <p className="empty-state empty-state--compact" role="status">Buscando antecedentes…</p>}
    {state.error && <div className="notice notice--error" role="alert">{state.error}</div>}
    {!state.loading && !state.error && !state.rows.length && <p className="empty-state empty-state--compact">No se encontraron observaciones históricas relacionadas.</p>}
    {!!state.rows.length && <div className="similar-cases-list">{state.rows.slice(0, 8).map(row => <article key={`${row.datasetId}-${row.externalId}`}>
      <div><strong>{row.code}</strong><span>{row.period} · v{row.version}</span></div>
      <p>{row.p309}</p>
      <small>{row.description || 'Sin descripción'} · Responsable: {row.actor}</small>
    </article>)}</div>}
  </section>;
}
