import Panel from '../../shared/ui/Panel.jsx';

const qualityLabels = {
  baja: 'Calidad baja',
  media: 'Calidad media',
};

const reasonLabels = {
  p309_vacio: 'P309 está vacío',
  p309_demasiado_corto: 'P309 es demasiado corto',
  exceso_de_simbolos: 'hay demasiados símbolos',
  caracteres_repetidos: 'hay caracteres repetidos',
  sin_contexto_p308: 'faltan ocupación y tareas',
  respuesta_no_informativa: 'la respuesta no aporta información suficiente',
  texto_sin_sentido: 'el texto no tiene significado económico reconocible',
};

function qualityMessage(quality) {
  if (!quality || !['baja', 'media'].includes(quality.nivel)) return '';
  const reasons = (quality.motivos || []).map(reason => reasonLabels[reason] || reason.replaceAll('_', ' '));
  return reasons.length ? `${qualityLabels[quality.nivel]}: ${reasons.join(', ')}.` : `${qualityLabels[quality.nivel]}.`;
}

// Antecedentes similares y observaciones de calidad. Se muestra plegado para no
// competir con la decisión principal.
export default function HistoricalEvidence({ evidence }) {
  const similarCases = Array.isArray(evidence?.casos_similares) ? evidence.casos_similares.slice(0, 3) : [];
  const quality = evidence?.calidad_entrada;
  const warning = qualityMessage(quality);
  if (!similarCases.length && !warning) return null;

  return (
    <Panel as="details" className={['group p-5', quality?.nivel === 'baja' ? 'border-[#efc8c4]' : ''].join(' ')}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
        <div className="grid gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Referencia histórica</p>
          <h2 className="text-base font-bold text-ink-strong">{similarCases.length ? 'Casos anteriores similares' : 'Calidad de la respuesta'}</h2>
          <p className="text-sm text-muted">
            {similarCases.length
              ? `${similarCases.length} antecedente${similarCases.length === 1 ? '' : 's'} disponible${similarCases.length === 1 ? '' : 's'} para apoyar la decisión.`
              : 'El clasificador detectó que la respuesta necesita revisión antes de codificarse.'}
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold text-brand group-open:hidden">{similarCases.length ? 'Ver antecedentes' : 'Ver observación'}</span>
      </summary>

      <div className="mt-4 grid gap-3">
        {warning && (
          <div role="note" className="grid gap-1 rounded-lg border border-[#efc8c4] bg-danger-soft p-3 text-sm text-danger">
            <strong>{qualityLabels[quality.nivel]}</strong>
            <span>{warning.replace(`${qualityLabels[quality.nivel]}: `, '').replace(`${qualityLabels[quality.nivel]}.`, 'Revisa el texto antes de decidir.')}</span>
          </div>
        )}
        {similarCases.length > 0 && (
          <div className="grid gap-3 md:grid-cols-3">
            {similarCases.map((item, index) => (
              <article key={`${item.codigo}-${index}`} className="grid content-start gap-2 rounded-lg border border-line bg-[#f8fbff] p-3">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-ink-strong">{item.codigo}</strong>
                  <span className="text-xs font-semibold text-muted">{Math.round(Number(item.similitud) * 100)} % similar</span>
                </div>
                <p className="text-sm text-ink">{item.p309}</p>
                {item.p308 && <small className="text-xs text-muted">Ocupación: {item.p308}</small>}
              </article>
            ))}
          </div>
        )}
        <p className="text-xs text-muted">Úsalos como referencia. La respuesta actual sigue siendo la fuente principal.</p>
      </div>
    </Panel>
  );
}
