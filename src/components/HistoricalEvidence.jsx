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

export default function HistoricalEvidence({ evidence }) {
  const similarCases = Array.isArray(evidence?.casos_similares) ? evidence.casos_similares.slice(0, 3) : [];
  const quality = evidence?.calidad_entrada;
  const warning = qualityMessage(quality);
  if (!similarCases.length && !warning) return null;

  return (
    <details className={`panel panel--wide history-disclosure${quality?.nivel === 'baja' ? ' history-disclosure--warning' : ''}`}>
      <summary>
        <div>
          <p className="eyebrow">Referencia histórica</p>
          <h2>{similarCases.length ? 'Casos anteriores similares' : 'Calidad de la respuesta'}</h2>
          <p>{similarCases.length
            ? `${similarCases.length} antecedente${similarCases.length === 1 ? '' : 's'} disponible${similarCases.length === 1 ? '' : 's'} para apoyar la decisión.`
            : 'El clasificador detectó que la respuesta necesita revisión antes de codificarse.'}</p>
        </div>
        <span>{similarCases.length ? 'Ver antecedentes' : 'Ver observación'}</span>
      </summary>
      <div className="history-disclosure__body">
        {warning && <div className="history-quality" role="note"><strong>{qualityLabels[quality.nivel]}</strong><span>{warning.replace(`${qualityLabels[quality.nivel]}: `, '').replace(`${qualityLabels[quality.nivel]}.`, 'Revisa el texto antes de decidir.')}</span></div>}
        {similarCases.length > 0 && (
          <div className="history-list">
            {similarCases.map((item, index) => (
              <article className="history-card" key={`${item.codigo}-${index}`}>
                <div className="history-card__heading">
                  <strong>{item.codigo}</strong>
                  <span>{Math.round(Number(item.similitud) * 100)} % similar</span>
                </div>
                <p>{item.p309}</p>
                {item.p308 && <small>Ocupación: {item.p308}</small>}
              </article>
            ))}
          </div>
        )}
        <p className="history-note">Úsalos como referencia. La respuesta actual sigue siendo la fuente principal.</p>
      </div>
    </details>
  );
}
