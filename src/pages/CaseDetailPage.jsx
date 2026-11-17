import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ContextHelp from '../components/ContextHelp';
import { operationalText } from '../utils/operationalText';
import HistoricalEvidence from '../components/HistoricalEvidence';
import SimilarCasesPanel from '../components/SimilarCasesPanel';
import QualityReviewPanel from '../components/QualityReviewPanel';
import CodingRulesPanel from '../components/CodingRulesPanel';
import StatusBadge from '../components/StatusBadge';
import useDatasetWorkspace from '../hooks/useDatasetWorkspace';
import { useAuth } from '../state/AuthContext';
import { useData } from '../state/DataContext';

export default function CaseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { activeDataset, decide, consultQwen, searchCatalogPage } = useData();
  const requestedDatasetId = Number(searchParams.get('dataset')) || activeDataset?.id;
  const { selectedDataset, cases, loading: workspaceLoading, error: workspaceError, refresh } = useDatasetWorkspace(requestedDatasetId);
  const item = cases.find(entry => entry.id_registro === id);
  const [selected, setSelected] = useState(item?.codigo_final || item?.candidatos?.[0]?.codigo || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogResults, setCatalogResults] = useState([]);
  const [catalogSelected, setCatalogSelected] = useState('');
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogMore, setCatalogMore] = useState(false);
  const correctionDialog = useRef(null);
  const catalogList = useRef(null);
  const canDecide = ['analista', 'supervisor', 'admin'].includes(user.role);
  const canReviewQuality = ['supervisor', 'admin'].includes(user.role);
  const catalogPageSize = 500;

  useEffect(() => {
    if (item) setSelected(item.codigo_final || item.candidatos?.[0]?.codigo || '');
  }, [item?.id, item?.codigo_final]);

  useEffect(() => {
    let active = true;
    setCatalogLoading(true);
    const timer = setTimeout(() => {
      searchCatalogPage(catalogQuery, { limit: catalogPageSize })
        .then(page => { if (active) { setCatalogResults(page.rows); setCatalogTotal(page.total); if (catalogList.current) catalogList.current.scrollTop = 0; } })
        .catch(() => { if (active) { setCatalogResults([]); setCatalogTotal(0); } })
        .finally(() => { if (active) setCatalogLoading(false); });
    }, 180);
    return () => { active = false; clearTimeout(timer); };
  }, [catalogQuery]);

  async function loadMoreCatalog() {
    if (catalogMore) return;
    setCatalogMore(true);
    try {
      const page = await searchCatalogPage(catalogQuery, { limit: catalogPageSize, offset: catalogResults.length });
      setCatalogResults(current => {
        const seen = new Set(current.map(row => row.codigo));
        return [...current, ...page.rows.filter(row => !seen.has(row.codigo))];
      });
      setCatalogTotal(page.total);
    } catch {
      setCatalogTotal(catalogResults.length);
    } finally { setCatalogMore(false); }
  }

  const backTarget = selectedDataset ? `/casos?dataset=${selectedDataset.id}` : '/casos';
  if (workspaceLoading) return <div className="page"><div className="panel loading-panel" role="status">Cargando registro…</div></div>;
  if (!item) return <div className="page"><h1>Registro no encontrado</h1><p>{workspaceError || 'El registro no pertenece a la base seleccionada.'}</p><Link to={backTarget}>Volver a la bandeja</Link></div>;

  async function runQwen() {
    setLoading(true); setError(''); setNotice('');
    try {
      const result = await consultQwen(selectedDataset.id, item.id_registro, item, user);
      if (!result) throw new Error('No se recibió una respuesta utilizable.');
      if (result.codigo) setSelected(result.codigo);
      await refresh();
      setNotice('Consulta de IA registrada correctamente.');
    } catch (err) {
      setError(err.name === 'AbortError' ? 'La consulta superó el tiempo de espera.' : err.message);
    } finally {
      setLoading(false);
    }
  }

  async function save(action, code = selected, justification = '') {
    setLoading(true); setError('');
    try {
      const currentIndex = cases.findIndex(entry => entry.id_registro === item.id_registro);
      const requiresAttention = entry => entry.id_registro !== item.id_registro && ['pendiente', 'revision'].includes(entry.estado);
      const nextItem = cases.slice(currentIndex + 1).find(requiresAttention) || cases.slice(0, Math.max(0, currentIndex)).find(requiresAttention);
      await decide(selectedDataset.id, item.id_registro, action, code, justification, user);
      await refresh();
      const savedMessage = action === 'derivación' ? 'El caso fue enviado a revisión humana.' : `Decisión guardada: ${code}.`;
      navigate(nextItem ? `/casos/${encodeURIComponent(nextItem.id_registro)}?dataset=${selectedDataset.id}` : backTarget, { replace: true, state: { notice: nextItem ? `${savedMessage} Se abrió el siguiente caso pendiente.` : `${savedMessage} No quedan más casos pendientes.` } });
    } catch (cause) {
      setError(cause.message || 'No se pudo guardar la decisión.');
    } finally { setLoading(false); }
  }

  async function correct() {
    if (!catalogSelected) return;
    setSelected(catalogSelected);
    await save('corrección', catalogSelected);
  }

  return (
    <div className="page detail-page">
      <div className="back-row"><button type="button" className="text-link" onClick={() => navigate(backTarget)}>← Volver a codificación</button><StatusBadge status={item.estado} /></div>
      <header className="case-detail-heading">
        <strong className="case-detail-heading__dataset">{selectedDataset.name}</strong>
        <h1>Revisión de actividad económica</h1>
        <span className="case-detail-heading__id">Registro: {item.id_registro}</span>
      </header>
      {notice && <div className="notice notice--success" role="status">{notice}</div>}
      {error && <div className="notice notice--error" role="alert">{error}</div>}
      <div className="detail-grid">
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Información original</p><h2>Respuesta de la encuesta</h2></div></div>
          <dl className="response-grid"><div><dt>P309 Actividad económica</dt><dd>{item.p309 || 'No informado'}</dd></div><div><dt>C309_1 Sector primario</dt><dd>{item.c309_1 || 'No informado'}</dd></div><div><dt>P308 Ocupación</dt><dd>{item.p308 || 'No informado'}</dd></div><div><dt>P308A Tareas realizadas</dt><dd>{item.p308a || 'No informado'}</dd></div><div><dt>C310 Categoría de ocupación</dt><dd>{item.c310 || 'No informado'}</dd></div><div><dt>C311 Tipo de entidad</dt><dd>{item.c311 || 'No informado'}</dd></div><div><dt>C366 Nivel educativo</dt><dd>{item.c366 || 'No informado'}</dd></div></dl>
        </section>
        <section className="panel coding-panel">
          <div className="panel-heading"><div><p className="eyebrow">Clasificación asistida</p><h2>Códigos sugeridos</h2></div><div className="coding-panel-actions"><span>{Math.round(item.confianza_ml * 100)} % {item.evidencia_r2?.calibracion === 'softmax-sin-calibrar' ? 'puntaje sin calibrar' : 'máximo'}</span>{canDecide && <button className="button button--secondary" type="button" onClick={runQwen} disabled={loading || !item.candidatos.length}>{loading ? 'Procesando…' : 'Consultar IA'}</button>}</div></div>
          <ContextHelp title="¿Cómo interpretar los códigos y la confianza?"><p>El código CIIU identifica una actividad económica. El porcentaje indica la confianza de la sugerencia, no garantiza su corrección. Compara la respuesta original y la información complementaria antes de confirmar.</p></ContextHelp>
          <div className="candidate-list" role="radiogroup" aria-label="Códigos sugeridos">
            {item.candidatos.map(candidate => <label className={`candidate ${selected === candidate.codigo ? 'candidate--selected' : ''}`} key={candidate.codigo}><input type="radio" name="candidate" value={candidate.codigo} checked={selected === candidate.codigo} onChange={() => setSelected(candidate.codigo)} /><span className="candidate-code">{candidate.codigo}</span><span className="candidate-description">{candidate.descripcion}</span><strong>{Math.round(candidate.prob * 100)} %</strong></label>)}
          </div>
          {!item.candidatos.length && <p className="empty-state empty-state--compact">El clasificador no produjo candidatos. Este caso requiere selección manual desde el catálogo.</p>}
          {item.qwen && <div className="qwen-result qwen-result--compact"><div className="qwen-code"><span>IA sugiere</span><strong>{item.qwen.codigo || 'Revisión'}</strong></div><p>{operationalText(item.qwen.justificacion)}</p></div>}
        </section>
      </div>
      {canDecide && <section className="decision-bar" aria-label="Decisión del analista">
        <div><span>Código seleccionado</span><strong>{selected || 'Sin código seleccionado'}</strong></div>
        <div className="decision-actions"><button className="button button--primary" type="button" disabled={!selected || loading} onClick={() => save('confirmación')}>Confirmar y siguiente</button><button className="button button--secondary" type="button" onClick={() => { setCatalogSelected(''); correctionDialog.current?.showModal(); }}>Catálogo CIIU</button><button className="button button--danger-quiet" type="button" disabled={loading} onClick={() => save('derivación')}>Revisión</button></div>
      </section>}
      <div className="detail-history"><HistoricalEvidence evidence={item.evidencia_r2} /></div>
      <div className="support-stack"><details className="panel support-disclosure"><summary><div><p className="eyebrow">Consulta opcional</p><h2>Antecedentes y criterios relacionados</h2></div><span>Ver contexto</span></summary><div className="support-disclosure-body"><CodingRulesPanel datasetId={selectedDataset.id} caseId={item.id_registro} /><SimilarCasesPanel datasetId={selectedDataset.id} caseId={item.id_registro} /></div></details>
      {['supervisor', 'auditor', 'admin'].includes(user.role) && <details className="panel support-disclosure"><summary><div><p className="eyebrow">Solo para muestras supervisadas</p><h2>Control de calidad formal</h2></div><span>Evaluar muestra</span></summary><div className="support-disclosure-body"><QualityReviewPanel datasetId={selectedDataset.id} caseId={item.id_registro} currentCode={item.codigo_final} canReview={canReviewQuality} onReviewed={refresh} /></div></details>}</div>
      <dialog ref={correctionDialog} className="dialog catalog-dialog" onClose={() => { setCatalogQuery(''); setCatalogSelected(''); setCatalogTotal(0); }}>
        <form method="dialog" className="dialog-header"><div><p className="eyebrow">Catálogo CIIU Rev.4</p><h2>Seleccionar otro código CIIU</h2></div><button className="button button--quiet" aria-label="Cerrar">Cerrar</button></form>
        <label className="catalog-search">Buscar por código o descripción<input autoFocus type="search" value={catalogQuery} onChange={event => setCatalogQuery(event.target.value)} placeholder="Ej. 4711 o venta al por menor" /></label>
        <div className="catalog-results" role="listbox" aria-label="Códigos CIIU encontrados" ref={catalogList}>
          {catalogResults.map(row => <button className={catalogSelected === row.codigo ? 'catalog-result--selected' : ''} key={row.codigo} type="button" role="option" aria-selected={catalogSelected === row.codigo} onClick={() => setCatalogSelected(row.codigo)}><strong>{row.codigo}</strong><span>{row.descripcion}</span></button>)}
          {!catalogResults.length && !catalogLoading && <p className="empty-state empty-state--compact">No se encontraron códigos con ese criterio.</p>}
        </div>
        <div className="catalog-status" aria-live="polite">
          <span>{catalogLoading ? 'Buscando códigos…' : catalogResults.length < catalogTotal
            ? `${catalogResults.length} de ${catalogTotal} ${catalogQuery.trim() ? 'coincidencias' : 'clases del catálogo'}`
            : `${catalogTotal} ${catalogQuery.trim() ? 'coincidencia' : 'clase'}${catalogTotal === 1 ? '' : 's'}${catalogQuery.trim() ? '' : ' en el catálogo'}`}</span>
          {catalogResults.length < catalogTotal && <button className="button button--secondary" type="button" onClick={loadMoreCatalog} disabled={catalogMore}>{catalogMore ? 'Cargando…' : 'Cargar más'}</button>}
        </div>
        <div className="catalog-confirm"><div><span>{catalogSelected ? `Código seleccionado: ${catalogSelected}` : 'Selecciona un código del catálogo'}</span><button className="button button--primary" type="button" disabled={!catalogSelected || loading} onClick={correct}>{loading ? 'Guardando…' : 'Usar código y continuar'}</button></div></div>
      </dialog>
    </div>
  );
}
