import { useEffect, useState } from 'react';
import DatasetWorkspaceSelector from '../components/DatasetWorkspaceSelector';
import PageHeader from '../components/epen/PageHeader';
import PanelHeading from '../components/epen/PanelHeading';
import { compareDatasetsReal, getQualitySummaryReal } from '../services/dataClient';
import { useData } from '../state/DataContext';

const pct = value => value === null || value === undefined ? 'Sin muestra' : `${(Number(value) * 100).toFixed(1)} %`;

export default function QualityPage() {
  const { datasets, activeDataset } = useData();
  const [datasetId, setDatasetId] = useState(activeDataset?.id || null);
  const [compareId, setCompareId] = useState(null);
  const [quality, setQuality] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!datasetId) return;
    setLoading(true); setMessage('');
    getQualitySummaryReal(datasetId).then(setQuality).catch(error => setMessage(error.message)).finally(() => setLoading(false));
  }, [datasetId]);

  useEffect(() => {
    if (compareId && String(compareId) !== String(datasetId)) return;
    setCompareId(datasets.find(item => String(item.id) !== String(datasetId))?.id || null);
  }, [datasetId, datasets, compareId]);

  async function compare() {
    if (!datasetId || !compareId || String(datasetId) === String(compareId)) return;
    setLoading(true); setMessage('');
    try { setComparison(await compareDatasetsReal(datasetId, compareId)); }
    catch (error) { setMessage(error.message); }
    finally { setLoading(false); }
  }

  const totalReviewed = quality?.coders.reduce((sum, item) => sum + item.reviewed, 0) || 0;
  const totalIncorrect = quality?.coders.reduce((sum, item) => sum + item.incorrect, 0) || 0;

  return <div className="page quality-page">
    <PageHeader
      icon="shield-check"
      eyebrow="Supervisión y auditoría"
      title="Control de calidad"
      description="Compara periodos y revisa resultados adjudicados. Una señal atípica requiere análisis; no demuestra por sí sola un error o sesgo."
    />
    <DatasetWorkspaceSelector datasets={datasets} selectedId={datasetId} onChange={setDatasetId} />
    {message && <div className="notice notice--error" role="alert">{message}</div>}
    {loading && <div className="notice" role="status">Calculando indicadores…</div>}
    <section className="stats-grid quality-stats">
      <article className="stat"><span>Revisiones formales</span><strong>{totalReviewed}</strong><small>Decisiones con adjudicación registrada</small></article>
      <article className="stat"><span>Errores confirmados</span><strong>{totalIncorrect}</strong><small>No incluye simples desacuerdos</small></article>
      <article className="stat"><span>Tasa sobre revisados</span><strong>{totalReviewed ? pct(totalIncorrect / totalReviewed) : 'Sin muestra'}</strong><small>Debe interpretarse junto al tamaño de muestra</small></article>
    </section>
    <section className="panel quality-coders-panel">
      <PanelHeading
        eyebrow="Desempeño observado"
        title="Codificadores"
        description="Las concentraciones por rama son alertas para muestreo, no evaluaciones automáticas de una persona."
      />
      <div className="table-wrap" role="region" aria-label="Indicadores por codificador" tabIndex={0}>
        <table>
          <thead><tr><th>Codificador</th><th>Decisiones</th><th>Correcciones</th><th>Revisadas</th><th>Error confirmado</th><th>Rama dominante</th></tr></thead>
          <tbody>{quality?.coders.map(row => <tr key={row.id}><td data-label="Codificador"><strong>{row.name}</strong><small>@{row.username}</small></td><td data-label="Decisiones">{row.decisions}</td><td data-label="Correcciones">{row.corrections}</td><td data-label="Revisadas">{row.reviewed}</td><td data-label="Error confirmado">{pct(row.errorRate)}</td><td data-label="Rama dominante">{row.dominantBranch ? `${row.dominantBranch} · ${pct(row.dominantShare)}` : '—'}</td></tr>)}</tbody>
        </table>
        {!quality?.coders.length && <p className="empty-state">Esta base todavía no tiene decisiones humanas.</p>}
      </div>
    </section>
    <section className="panel comparison-panel">
      <PanelHeading
        eyebrow="Comparación de periodos"
        title="Variaciones de códigos CIIU"
        description="Selecciona otra versión para comparar distribuciones entre bases."
      />
      <DatasetWorkspaceSelector datasets={datasets.filter(item => String(item.id) !== String(datasetId))} selectedId={compareId} onChange={setCompareId} />
      <button className="button button--primary" type="button" disabled={!compareId || loading} onClick={compare}>{loading ? 'Calculando…' : 'Comparar bases'}</button>
      {comparison && <div className="comparison-results">
        <div className="comparison-summary">
          <article><span>{comparison.left.dataset.period}</span><strong>{comparison.left.totals.resolved}</strong><small>registros resueltos</small></article>
          <article><span>{comparison.right.dataset.period}</span><strong>{comparison.right.totals.resolved}</strong><small>registros resueltos</small></article>
        </div>
        <div className="table-wrap" role="region" aria-label="Cambios por código CIIU" tabIndex={0}>
          <table>
            <thead><tr><th>Código</th><th>Descripción</th><th>{comparison.left.dataset.period}</th><th>{comparison.right.dataset.period}</th><th>Variación</th></tr></thead>
            <tbody>{comparison.codeChanges.map(row => <tr key={row.code}><td data-label="Código"><strong>{row.code}</strong></td><td data-label="Descripción">{row.description}</td><td data-label={comparison.left.dataset.period}>{pct(row.leftShare)}</td><td data-label={comparison.right.dataset.period}>{pct(row.rightShare)}</td><td data-label="Variación" className={row.change > 0 ? 'change-positive' : row.change < 0 ? 'change-negative' : ''}>{row.change > 0 ? '+' : ''}{(row.change * 100).toFixed(1)} pp</td></tr>)}</tbody>
          </table>
        </div>
      </div>}
    </section>
  </div>;
}
