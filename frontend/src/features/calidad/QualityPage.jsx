import { useEffect, useState } from 'react';
import DatasetWorkspaceSelector from '../../shared/components/DatasetWorkspaceSelector.jsx';
import PageHeader from '../../shared/ui/PageHeader.jsx';
import PanelHeading from '../../shared/ui/PanelHeading.jsx';
import Panel from '../../shared/ui/Panel.jsx';
import Stat from '../../shared/ui/Stat.jsx';
import Button from '../../shared/ui/Button.jsx';
import Notice from '../../shared/ui/Notice.jsx';
import { tableClasses as t } from '../../shared/ui/tableClasses.js';
import { compareDatasetsReal, getQualitySummaryReal } from '../../shared/api/dataClient.js';
import { useData } from '../../app/state/DataContext.jsx';
import { useAuth } from '../../app/state/AuthContext.jsx';
import BlindVerificationPanel from './BlindVerificationPanel.jsx';
import QualityMetricsPanel from './QualityMetricsPanel.jsx';
import ReferenceComparisonPanel from './ReferenceComparisonPanel.jsx';

const pct = value => value === null || value === undefined ? 'Sin muestra' : `${(Number(value) * 100).toFixed(1)} %`;
const changeTone = change => change > 0 ? 'text-[#05603a] font-semibold' : change < 0 ? 'text-danger font-semibold' : 'text-muted';

// Control de calidad: codificadores, error confirmado y comparación de periodos.
// Las señales son alertas para muestreo; no demuestran por sí solas un error o sesgo.
export default function QualityPage() {
  const { datasets, activeDataset } = useData();
  const { user } = useAuth();
  const canVerify = ['supervisor', 'admin'].includes(user?.role);
  const [metricsKey, setMetricsKey] = useState(0);
  const [datasetId, setDatasetId] = useState(activeDataset?.id || null);
  const [compareId, setCompareId] = useState(null);
  const [quality, setQuality] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!datasetId) return;
    setLoading(true);
    setMessage('');
    getQualitySummaryReal(datasetId)
      .then(setQuality)
      .catch(error => setMessage(error.message))
      .finally(() => setLoading(false));
  }, [datasetId]);

  useEffect(() => {
    if (compareId && String(compareId) !== String(datasetId)) return;
    setCompareId(datasets.find(item => String(item.id) !== String(datasetId))?.id || null);
  }, [datasetId, datasets, compareId]);

  async function compare() {
    if (!datasetId || !compareId || String(datasetId) === String(compareId)) return;
    setLoading(true);
    setMessage('');
    try {
      setComparison(await compareDatasetsReal(datasetId, compareId));
    } catch (error) {
      setMessage(error.message);
    } finally { setLoading(false); }
  }

  const totalReviewed = quality?.coders.reduce((sum, item) => sum + item.reviewed, 0) || 0;
  const totalIncorrect = quality?.coders.reduce((sum, item) => sum + item.incorrect, 0) || 0;

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        icon="shield-check"
        title="Control de calidad"
        description="Compara periodos y revisa resultados adjudicados. Una señal atípica requiere análisis; no demuestra por sí sola un error o sesgo."
      />

      <DatasetWorkspaceSelector datasets={datasets} selectedId={datasetId} onChange={setDatasetId} />
      {message && <Notice tone="error">{message}</Notice>}
      {loading && <Notice>Calculando indicadores…</Notice>}

      <section aria-label="Resumen de calidad" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Revisiones formales" value={totalReviewed} hint="Decisiones con adjudicación registrada" />
        <Stat label="Errores confirmados" value={totalIncorrect} hint="No incluye simples desacuerdos" />
        <Stat label="Tasa sobre revisados" value={totalReviewed ? pct(totalIncorrect / totalReviewed) : 'Sin muestra'} hint="Interpretar junto al tamaño de muestra" />
      </section>

      <div className="grid grid-cols-1 gap-4">
        {canVerify && datasetId && <BlindVerificationPanel datasetId={datasetId} onRegistered={() => setMetricsKey(value => value + 1)} />}
        {datasetId && <QualityMetricsPanel datasetId={datasetId} refreshKey={metricsKey} />}
        {datasetId && <ReferenceComparisonPanel datasetId={datasetId} datasetName={datasets.find(item => String(item.id) === String(datasetId))?.name} canManage={canVerify} />}
      </div>

      <Panel className="p-5">
        <PanelHeading title="Codificadores" description="Las concentraciones por rama son alertas para muestreo, no evaluaciones automáticas de una persona." />
        <div role="region" aria-label="Indicadores por codificador" tabIndex={0} className={t.wrap}>
          <table className={t.table}>
            <thead className={t.head}>
              <tr>
                <th scope="col" className={t.th}>Codificador</th>
                <th scope="col" className={t.th}>Decisiones</th>
                <th scope="col" className={t.th}>Correcciones</th>
                <th scope="col" className={t.th}>Revisadas</th>
                <th scope="col" className={t.th}>Error confirmado</th>
                <th scope="col" className={t.th}>Rama dominante</th>
              </tr>
            </thead>
            <tbody className={t.body}>
              {quality?.coders.map(row => (
                <tr key={row.id} className={t.row}>
                  <td data-label="Codificador" className={t.cell}><strong className="block text-ink-strong">{row.name}</strong><small className="text-xs text-muted">@{row.username}</small></td>
                  <td data-label="Decisiones" className={t.cell}>{row.decisions}</td>
                  <td data-label="Correcciones" className={t.cell}>{row.corrections}</td>
                  <td data-label="Revisadas" className={t.cell}>{row.reviewed}</td>
                  <td data-label="Error confirmado" className={t.cell}>{pct(row.errorRate)}</td>
                  <td data-label="Rama dominante" className={t.cell}>{row.dominantBranch ? `${row.dominantBranch} · ${pct(row.dominantShare)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!quality?.coders.length && <p className="py-8 text-center text-sm text-muted">Esta base todavía no tiene decisiones humanas.</p>}
        </div>
      </Panel>

      <Panel className="grid grid-cols-1 gap-4 p-5">
        <PanelHeading title="Variaciones de códigos CIIU" description="Selecciona otra versión para comparar distribuciones entre bases." />
        <DatasetWorkspaceSelector datasets={datasets.filter(item => String(item.id) !== String(datasetId))} selectedId={compareId} onChange={setCompareId} />
        <div>
          <Button disabled={!compareId || loading} onClick={compare}>{loading ? 'Calculando…' : 'Comparar bases'}</Button>
        </div>

        {comparison && (
          <div className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Stat label={comparison.left.dataset.period} value={comparison.left.totals.resolved} hint="registros resueltos" />
              <Stat label={comparison.right.dataset.period} value={comparison.right.totals.resolved} hint="registros resueltos" />
            </div>
            <div role="region" aria-label="Cambios por código CIIU" tabIndex={0} className={t.wrap}>
              <table className={t.table}>
                <thead className={t.head}>
                  <tr>
                    <th scope="col" className={t.th}>Código</th>
                    <th scope="col" className={t.th}>Descripción</th>
                    <th scope="col" className={t.th}>{comparison.left.dataset.period}</th>
                    <th scope="col" className={t.th}>{comparison.right.dataset.period}</th>
                    <th scope="col" className={t.th}>Variación</th>
                  </tr>
                </thead>
                <tbody className={t.body}>
                  {comparison.codeChanges.map(row => (
                    <tr key={row.code} className={t.row}>
                      <td data-label="Código" className={t.cell}><strong className="text-ink-strong">{row.code}</strong></td>
                      <td data-label="Descripción" className={t.cell}>{row.description}</td>
                      <td data-label={comparison.left.dataset.period} className={t.cell}>{pct(row.leftShare)}</td>
                      <td data-label={comparison.right.dataset.period} className={t.cell}>{pct(row.rightShare)}</td>
                      <td data-label="Variación" className={[t.cell, changeTone(row.change)].join(' ')}>
                        {row.change > 0 ? '+' : ''}{(row.change * 100).toFixed(1)} pp
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
