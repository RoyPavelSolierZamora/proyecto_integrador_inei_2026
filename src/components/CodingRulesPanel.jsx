import { useEffect, useState } from 'react';
import { getCaseCodingRulesReal } from '../services/dataClient';

export default function CodingRulesPanel({ datasetId, caseId }) {
  const [rules, setRules] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setError('');
    getCaseCodingRulesReal(datasetId, caseId)
      .then(result => { if (active) setRules(result.rules || []); })
      .catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [datasetId, caseId]);

  return <section className="panel panel--wide coding-rules-panel">
    <div className="panel-heading"><div><p className="eyebrow">Criterios institucionales</p><h2>Reglas vigentes relacionadas</h2><p>Se muestran solo criterios aprobados. Son apoyo para revisar el contexto, no decisiones automáticas.</p></div></div>
    {error && <p className="notice notice--error" role="alert">{error}</p>}
    <div className="coding-rules-matches">{rules.map(rule => <article key={rule.id}>
      <header><strong>{rule.code} · {rule.title}</strong><span>{rule.matches} coincidencia{rule.matches === 1 ? '' : 's'}</span></header>
      <p>{rule.guidance}</p>
      <small>{rule.sourceReference ? `Fuente: ${rule.sourceReference}` : `Aprobado por ${rule.approvedBy}`}</small>
    </article>)}</div>
    {!error && !rules.length && <p className="empty-state empty-state--compact">No hay criterios aprobados relacionados con este registro.</p>}
  </section>;
}
