import { useEffect, useState } from 'react';
import { getSimilarCasesReal } from '../../shared/api/dataClient.js';
import Panel from '../../shared/ui/Panel.jsx';
import PanelHeading from '../../shared/ui/PanelHeading.jsx';
import Notice from '../../shared/ui/Notice.jsx';

// Casos parecidos de otras bases. Son referencias para leer, no reglas automáticas.
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

  return (
    <Panel className="grid gap-3 p-5">
      <PanelHeading title="Cómo se clasificaron observaciones relacionadas" description="Resultados de otras bases cargadas. Son referencias, no reglas automáticas." />
      {state.loading && <p role="status" className="text-sm text-muted">Buscando antecedentes…</p>}
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {!state.loading && !state.error && !state.rows.length && <p className="text-sm text-muted">No se encontraron observaciones históricas relacionadas.</p>}
      {!!state.rows.length && (
        <div className="grid gap-3 md:grid-cols-2">
          {state.rows.slice(0, 8).map(row => (
            <article key={`${row.datasetId}-${row.externalId}`} className="grid content-start gap-1.5 rounded-lg border border-line bg-[#f8fbff] p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <strong className="text-ink-strong">{row.code}</strong>
                <span className="text-xs text-muted">{row.period} · v{row.version}</span>
              </div>
              <p className="text-sm text-ink">{row.p309}</p>
              <small className="text-xs text-muted">{row.description || 'Sin descripción'} · Responsable: {row.actor}</small>
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}
