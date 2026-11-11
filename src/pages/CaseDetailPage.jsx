import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import HistoricalEvidence from '../components/HistoricalEvidence';
import StatusBadge from '../components/StatusBadge';
import useDatasetWorkspace from '../hooks/useDatasetWorkspace';
import { useAuth } from '../state/AuthContext';
import { useData } from '../state/DataContext';

export default function CaseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { activeDataset, decide, consultQwen, searchCatalog } = useData();
  const requestedDatasetId = Number(searchParams.get('dataset')) || activeDataset?.id;
  const { selectedDataset, cases, loading: workspaceLoading, error: workspaceError, refresh } = useDatasetWorkspace(requestedDatasetId);
  const item = cases.find(entry => entry.id_registro === id);
  const [selected, setSelected] = useState(item?.codigo_final || item?.candidatos?.[0]?.codigo || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogResults, setCatalogResults] = useState([]);
  const correctionDialog = useRef(null);

  useEffect(() => {
    if (item) setSelected(item.codigo_final || item.candidatos?.[0]?.codigo || '');
  }, [item?.id, item?.codigo_final]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      searchCatalog(catalogQuery).then(rows => { if (active) setCatalogResults(rows.slice(0, 20)); }).catch(() => { if (active) setCatalogResults([]); });
    }, 180);
    return () => { active = false; clearTimeout(timer); };
  }, [catalogQuery]);

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

  async function save(action, code = selected) {
    setLoading(true); setError('');
    try {
      await decide(selectedDataset.id, item.id_registro, action, code, user);
      await refresh();
      setNotice(action === 'derivación' ? 'El caso fue enviado a revisión humana.' : `Decisión guardada: ${code}.`);
    } catch (cause) {
      setError(cause.message || 'No se pudo guardar la decisión.');
    } finally { setLoading(false); }
  }

  async function correct(code) {
    setSelected(code);
    await save('corrección', code);
    correctionDialog.current?.close();
    setCatalogQuery('');
  }

  return (
    <div className="page detail-page">
      <div className="back-row"><button type="button" className="text-link" onClick={() => navigate(backTarget)}>← Volver a codificación</button><StatusBadge status={item.estado} /></div>
      <div className="page-heading"><div><p className="eyebrow">Registro {item.id_registro}</p><h1>Revisión de actividad económica</h1><p>Base: <strong>{selectedDataset.name}</strong> · {selectedDataset.period} · v{selectedDataset.version}. Compara la respuesta original, los códigos candidatos y la recomendación de la IA.</p></div></div>
      {notice && <div className="notice notice--success" role="status">{notice}</div>}
      {error && <div className="notice notice--error" role="alert">{error}</div>}
      <div className="detail-grid">
        <section className="panel panel--wide">
          <div className="panel-heading"><div><p className="eyebrow">Información original</p><h2>Respuesta de la encuesta</h2></div></div>
          <dl className="response-grid"><div><dt>P309 Actividad económica</dt><dd>{item.p309}</dd></div><div><dt>P308 Ocupación</dt><dd>{item.p308}</dd></div><div><dt>P308A Tareas realizadas</dt><dd>{item.p308a}</dd></div></dl>
        </section>
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Clasificador automático</p><h2>Códigos candidatos</h2></div><span>{Math.round(item.confianza_ml * 100)} % máximo</span></div>
          <div className="candidate-list" role="radiogroup" aria-label="Códigos candidatos">
            {item.candidatos.map(candidate => <label className={`candidate ${selected === candidate.codigo ? 'candidate--selected' : ''}`} key={candidate.codigo}><input type="radio" name="candidate" value={candidate.codigo} checked={selected === candidate.codigo} onChange={() => setSelected(candidate.codigo)} /><span className="candidate-code">{candidate.codigo}</span><span className="candidate-description">{candidate.descripcion}</span><strong>{Math.round(candidate.prob * 100)} %</strong></label>)}
          </div>
          {!item.candidatos.length && <p className="empty-state empty-state--compact">El clasificador no produjo candidatos. Este caso requiere selección manual desde el catálogo.</p>}
        </section>
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Apoyo para casos difíciles</p><h2>Asistente de IA</h2></div><button className="button button--secondary" type="button" onClick={runQwen} disabled={loading || !item.candidatos.length}>{loading ? 'Procesando…' : item.qwen ? 'Consultar nuevamente' : 'Consultar IA'}</button></div>
          {item.qwen ? <div className="qwen-result"><div className="qwen-code"><span>Código sugerido</span><strong>{item.qwen.codigo || 'Revisión'}</strong></div><p>{item.qwen.justificacion}</p><small>Latencia: {item.qwen.latencia_s?.toFixed?.(1) || item.qwen.latencia_s} s · La IA funciona como apoyo y no reemplaza los controles de calidad.</small></div> : <p className="empty-state empty-state--compact">Todavía no se consultó la asistencia de IA para este registro.</p>}
        </section>
        <HistoricalEvidence evidence={item.evidencia_r2} />
      </div>
      <section className="decision-bar" aria-label="Decisión del analista">
        <div><span>Decisión actual</span><strong>{selected || 'Sin código seleccionado'}</strong></div>
        <div className="decision-actions"><button className="button button--primary" type="button" disabled={!selected} onClick={() => save('confirmación')}>Confirmar código</button><button className="button button--secondary" type="button" onClick={() => correctionDialog.current?.showModal()}>Buscar otro código</button><button className="button button--danger-quiet" type="button" onClick={() => save('derivación')}>Enviar a revisión</button></div>
      </section>
      <dialog ref={correctionDialog} className="dialog" onClose={() => setCatalogQuery('')}>
        <form method="dialog" className="dialog-header"><div><p className="eyebrow">Catálogo CIIU Rev.4</p><h2>Seleccionar otro código CIIU</h2></div><button className="button button--quiet" aria-label="Cerrar">Cerrar</button></form>
        <label className="catalog-search">Buscar por código o descripción<input autoFocus type="search" value={catalogQuery} onChange={event => setCatalogQuery(event.target.value)} /></label>
        <div className="catalog-results">{catalogResults.map(row => <button key={row.codigo} type="button" onClick={() => correct(row.codigo)}><strong>{row.codigo}</strong><span>{row.descripcion}</span></button>)}</div>
        {!catalogResults.length && <p className="empty-state">No se encontraron códigos.</p>}
      </dialog>
    </div>
  );
}
