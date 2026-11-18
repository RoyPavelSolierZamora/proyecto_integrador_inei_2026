import { useEffect, useState } from 'react';
import { getCaseCodingRulesReal } from '../../shared/api/dataClient.js';
import Panel from '../../shared/ui/Panel.jsx';
import PanelHeading from '../../shared/ui/PanelHeading.jsx';
import Notice from '../../shared/ui/Notice.jsx';

// Criterios aprobados que coinciden con el registro. Solo se muestran criterios vigentes.
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

  return (
    <Panel className="grid gap-3 p-5">
      <PanelHeading title="Reglas vigentes relacionadas" description="Se muestran solo criterios aprobados. Son apoyo para revisar el contexto, no decisiones automáticas." />
      {error && <Notice tone="error">{error}</Notice>}
      {rules.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {rules.map(rule => (
            <article key={rule.id} className="grid content-start gap-1.5 rounded-lg border border-line bg-[#f8fbff] p-3">
              <header className="flex flex-wrap items-baseline justify-between gap-2">
                <strong className="text-ink-strong">{rule.code} · {rule.title}</strong>
                <span className="text-xs text-muted">{rule.matches} coincidencia{rule.matches === 1 ? '' : 's'}</span>
              </header>
              <p className="text-sm text-ink">{rule.guidance}</p>
              <small className="text-xs text-muted">{rule.sourceReference ? `Fuente: ${rule.sourceReference}` : `Aprobado por ${rule.approvedBy}`}</small>
            </article>
          ))}
        </div>
      )}
      {!error && !rules.length && <p className="text-sm text-muted">No hay criterios aprobados relacionados con este registro.</p>}
    </Panel>
  );
}
