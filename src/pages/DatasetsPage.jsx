import { useEffect, useMemo, useRef, useState } from 'react';
import { parseR2Csv, parseRawEpenCsv } from '../services/csvImport';
import { exportDatasetReal, listR2JobsReal, startR2JobReal } from '../services/dataClient';
import { useAuth } from '../state/AuthContext';
import { useData } from '../state/DataContext';

import EpenIcon from '../components/epen/EpenIcon';
import ProcessFlowCard from '../components/epen/ProcessFlowCard';
import DatasetCsvUpload from '../components/epen/DatasetCsvUpload';
import DatasetHistoryTable from '../components/epen/DatasetHistoryTable';
const DATASETS_PER_PAGE = 5;

export default function DatasetsPage() {
  const { user } = useAuth();
  const { cases, datasets, activeDataset, activateDataset, importDataset, simulateR2, reload, real } = useData();
  const [name, setName] = useState('');
  const [period, setPeriod] = useState('');
  const [file, setFile] = useState(null);
  const [synthetic, setSynthetic] = useState(true);
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [threshold, setThreshold] = useState('0.70');
  const [simulationThreshold, setSimulationThreshold] = useState('0.70');
  const [rawName, setRawName] = useState('');
  const [rawPeriod, setRawPeriod] = useState('');
  const [rawFile, setRawFile] = useState(null);
  const [rawText, setRawText] = useState('');
  const [rawPreview, setRawPreview] = useState(null);
  const [rawSynthetic, setRawSynthetic] = useState(true);
  const [qwenMode, setQwenMode] = useState('automatic');
  const [jobs, setJobs] = useState([]);
  const [exportingId, setExportingId] = useState(null);
  const [showAllJobs, setShowAllJobs] = useState(false);
  const [datasetQuery, setDatasetQuery] = useState('');
  const [datasetStatus, setDatasetStatus] = useState('todos');
  const [datasetPage, setDatasetPage] = useState(1);
  const rawInput = useRef(null);
  const rawSubmitBusy = useRef(false);
  const admin = user.role === 'admin';

  async function refreshJobs() {
    if (!real) return;
    const data = await listR2JobsReal();
    setJobs(data.jobs || []);
    if (data.jobs?.some(job => job.status === 'completed')) await reload({ silent: true });
  }

  useEffect(() => {
    if (!real) return undefined;
    let active = true;
    const update = () => listR2JobsReal().then(data => {
      if (!active) return;
      setJobs(data.jobs || []);
      const newestCompleted = data.jobs?.find(job => job.status === 'completed');
      if (newestCompleted && String(newestCompleted.datasetId) !== String(activeDataset?.id)) reload({ silent: true });
    }).catch(() => {});
    update();
    const timer = setInterval(update, 2500);
    return () => { active = false; clearInterval(timer); };
  }, [real, activeDataset?.id]);

  async function selectRawFile(files) {
    if (saving || reading) return;
    if (files.length > 1) return setMessage({ type: 'error', text: 'Selecciona un solo CSV original por trabajo.' });
    const selected = files?.[0] || null;
    setRawFile(selected); setRawText(''); setRawPreview(null); setMessage(null);
    if (!selected) return;
    if (selected.size > 25 * 1024 * 1024) return setMessage({ type: 'error', text: 'El archivo original no debe superar 25 MB por trabajo.' });
    setReading(true);
    try {
      const text = await selected.text();
      const result = parseRawEpenCsv(text);
      setRawText(text); setRawPreview(result);
      if (result.errors.length) setMessage({ type: 'error', text: `La base original tiene ${result.errors.length} observaciones.` });
    } catch (cause) {
      setMessage({ type: 'error', text: cause.message || 'No se pudo leer la base original.' });
    } finally { setReading(false); }
  }

  async function submitRaw(event) {
    event.preventDefault();
    if (rawSubmitBusy.current || saving || reading) return;
    const form = event.currentTarget;
    const value = Number(threshold);
    if (!rawName.trim() || !rawPeriod.trim()) return setMessage({ type: 'error', text: 'Completa el nombre y el periodo de la base original.' });
    if (!rawFile || !rawPreview?.rows.length || rawPreview.errors.length) return setMessage({ type: 'error', text: 'Selecciona un CSV original válido.' });
    if (!Number.isFinite(value) || value < 0 || value > 1) return setMessage({ type: 'error', text: 'El umbral debe estar entre 0 y 1.' });
    rawSubmitBusy.current = true;
    setSaving(true);
    try {
      const result = await startR2JobReal({ name: rawName.trim(), period: rawPeriod.trim(), fileName: rawFile.name, threshold: value, synthetic: rawSynthetic, qwenMode, csvText: rawText });
      setMessage({ type: 'success', text: `Trabajo R2 #${result.jobId} creado con ${result.records} registros. Puedes seguir su avance abajo.` });
      setRawName(''); setRawPeriod(''); setRawFile(null); setRawText(''); setRawPreview(null); setRawSynthetic(true); setQwenMode('automatic');
      form.reset(); await refreshJobs();
    } catch (cause) { setMessage({ type: 'error', text: cause.message || 'No se pudo iniciar el procesamiento R2.' }); }
    finally { rawSubmitBusy.current = false; setSaving(false); }
  }

  async function selectFile(event) {
    const selected = event.target.files?.[0] || null;
    setFile(selected); setPreview(null); setMessage(null);
    if (!selected) return;
    if (selected.size > 5 * 1024 * 1024) return setMessage({ type: 'error', text: 'Esta importación avanzada admite hasta 5 MB. Las bases originales se procesan mediante el flujo R2 por lotes.' });
    setReading(true);
    try {
      const result = parseR2Csv(await selected.text());
      setPreview(result);
      if (result.errors.length) setMessage({ type: 'error', text: `Se encontraron ${result.errors.length} observaciones. Corrige el archivo antes de importarlo.` });
    } catch {
      setMessage({ type: 'error', text: 'No se pudo leer el archivo seleccionado.' });
    } finally { setReading(false); }
  }

  async function exportDataset(dataset) {
    setExportingId(dataset.id);
    try {
      const blob = await exportDatasetReal(dataset.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `EPEN_${dataset.period}_resultados.csv`.replace(/[^a-zA-Z0-9._-]+/g, '_');
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: `Resultados de ${dataset.name} exportados. El CSV incluye el estado de cada registro.` });
    } catch (cause) { setMessage({ type: 'error', text: cause.message || 'No se pudo exportar la base.' }); }
    finally { setExportingId(null); }
  }

  const thresholdValue = Number(simulationThreshold);
  const automaticCount = Number.isFinite(thresholdValue) ? cases.filter(item => item.confianza_ml >= thresholdValue).length : 0;
  const visibleJobs = showAllJobs ? jobs : jobs.slice(0, 3);
  const filteredDatasets = useMemo(() => {
    const query = datasetQuery.trim().toLowerCase();
    return [...datasets]
      .sort((a, b) => Number(b.id === activeDataset?.id) - Number(a.id === activeDataset?.id) || new Date(b.importedAt) - new Date(a.importedAt))
      .filter(dataset => !query || `${dataset.name} ${dataset.period} ${dataset.fileName}`.toLowerCase().includes(query))
      .filter(dataset => datasetStatus === 'todos' || (datasetStatus === 'activa' ? dataset.id === activeDataset?.id : dataset.status === datasetStatus));
  }, [datasets, activeDataset?.id, datasetQuery, datasetStatus]);
  const totalDatasetPages = Math.max(1, Math.ceil(filteredDatasets.length / DATASETS_PER_PAGE));
  const visibleDatasets = filteredDatasets.slice((datasetPage - 1) * DATASETS_PER_PAGE, datasetPage * DATASETS_PER_PAGE);

  useEffect(() => { setDatasetPage(1); }, [datasetQuery, datasetStatus, datasets.length]);
  useEffect(() => { if (datasetPage > totalDatasetPages) setDatasetPage(totalDatasetPages); }, [datasetPage, totalDatasetPages]);

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!name.trim() || !period.trim()) return setMessage({ type: 'error', text: 'Completa el nombre y el periodo de la base.' });
    if (!file || !preview?.rows.length || preview.errors.length) return setMessage({ type: 'error', text: 'Selecciona un CSV válido antes de importarlo.' });
    setSaving(true);
    try {
      await importDataset({ name, period, fileName: file.name, rows: preview.rows, synthetic }, user);
      setMessage({ type: 'success', text: `Se importaron ${preview.rows.length} registros. La nueva base quedó activa.` });
      setName(''); setPeriod(''); setFile(null); setPreview(null); setSynthetic(true);
      form.reset();
    } catch (cause) {
      setMessage({ type: 'error', text: cause.message || 'No se pudo importar la base.' });
    } finally { setSaving(false); }
  }

  return (
    <div className="page epen-datasets">
      <div className="page-heading epen-datasets-heading"><span className="epen-heading-icon"><EpenIcon name="database"/></span><div><h1>Bases de datos</h1><p>Gestiona las bases EPEN, ejecuta el procesamiento R2 y consulta las versiones registradas.</p><small>Las versiones anteriores se conservan para trazabilidad.</small></div></div>
      <div className="notice epen-route-note"><strong>Ruta recomendada</strong><span>Carga la base original en el primer bloque. El sistema ejecutará R2 y derivará automáticamente los casos difíciles. Las herramientas excepcionales están agrupadas al final.</span></div>
      {message && <div className={`notice notice--${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</div>}
      {real && <div className="epen-datasets-upload-grid"><section className="panel r2-upload-panel">
        <div className="panel-heading"><div><div className="epen-card-title"><EpenIcon name="cloud-arrow-up"/><div><h2>Cargar base para codificación</h2><p>Selecciona el CSV original y configura el procesamiento.</p></div></div></div><a className="text-link" href={`${import.meta.env.BASE_URL}plantilla_base_original.csv`} download>Descargar plantilla original</a></div>
        <form className="r2-upload-form" onSubmit={submitRaw}>
          <label>Nombre de la encuesta<input value={rawName} onChange={event => setRawName(event.target.value)} placeholder="Ej. EPEN Lima y Callao" required /></label>
          <label>Periodo<input value={rawPeriod} onChange={event => setRawPeriod(event.target.value)} placeholder="Ej. 2027-T2" required /></label>
          <label>Umbral R2<input type="number" min="0" max="1" step="0.01" value={threshold} onChange={event => setThreshold(event.target.value)} required /></label>
          <label>Casos difíciles<select value={qwenMode} onChange={event => setQwenMode(event.target.value)}><option value="automatic">Qwen automático</option><option value="manual">Qwen manual</option></select></label>
          <DatasetCsvUpload file={rawFile} inputRef={rawInput} disabled={saving || reading} reading={reading} onSelect={selectRawFile} onRemove={() => { setRawFile(null); setRawText(''); setRawPreview(null); setMessage(null); rawInput.current.value = ''; }}/>
          <label className="checkbox-field"><input type="checkbox" checked={rawSynthetic} onChange={event => setRawSynthetic(event.target.checked)} /><span>Datos sintéticos de prueba</span></label>
          {rawPreview && <div className={`import-summary ${rawPreview.errors.length ? 'import-summary--error' : ''}`}><strong>{rawPreview.rows.length} registros detectados</strong><span>{rawPreview.errors.length ? `${rawPreview.errors.length} filas requieren corrección` : 'Lista para enviar al microservicio R2'}</span></div>}
          <button className="button button--primary" type="submit" disabled={saving || reading || !rawPreview || rawPreview.errors.length > 0}><EpenIcon name="file-earmark-code"/>{saving ? 'Creando trabajo…' : 'Procesar base con R2'}</button>
          {rawPreview?.errors.length > 0 && <ul className="validation-list">{rawPreview.errors.slice(0, 5).map((error,index)=><li key={index}>{error}</li>)}</ul>}
        </form>
        <p className="epen-upload-note">El backend envía el CSV a R2 por lotes. Crear el trabajo inicia el procesamiento; su finalización se consulta en el seguimiento inferior.</p>
      </section><ProcessFlowCard/></div>}
      {real && <section className="panel jobs-panel">
        <div className="panel-heading"><div><p className="eyebrow">Procesamiento asíncrono</p><h2>Trabajos R2 recientes</h2></div></div>
        <div className="job-list">{visibleJobs.map(job => {
          const percentage = job.total ? Math.round(job.processed / job.total * 100) : 0;
          const label = { queued: 'En cola', running: 'Procesando R2', qwen_running: 'Procesando Qwen', completed: 'Completado', failed: 'Falló', cancelled: 'Cancelado' }[job.status] || job.status;
          return <article className="job-card" key={job.id} data-status={job.status}><div><strong>#{job.id} · {job.datasetName}</strong><span>{job.period} · {job.modelVersion || 'Esperando R2'} · Qwen {job.qwenMode === 'automatic' ? 'automático' : 'manual'}</span></div><span className={`access-state ${job.status === 'completed' ? 'access-state--active' : ''}`}>{label}</span><div className="job-progress"><div role="progressbar" aria-label={`Progreso R2 del trabajo ${job.id}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}><span style={{ width: `${percentage}%` }} /></div><small>{job.processed}/{job.total} R2 · {percentage}% · {job.automatic} automáticos · {job.qwenPending} derivados a Qwen · {job.manual} directos a manual{job.qwenMode === 'automatic' ? ` · Qwen ${job.qwenProcessed}/${job.qwenPending}: ${job.qwenResolved} resueltos, ${job.qwenReview} a revisión` : ''}</small></div>{job.error && <p className="job-error">{job.error}</p>}</article>;
        })}{!jobs.length && <p className="empty-state empty-state--compact">Todavía no se iniciaron trabajos R2.</p>}</div>
        {jobs.length > 3 && <button className="button button--quiet jobs-toggle" type="button" onClick={() => setShowAllJobs(value => !value)}>{showAllJobs ? 'Mostrar solo los 3 más recientes' : `Ver los ${jobs.length} trabajos`}</button>}
      </section>}
      <section className="panel versions-panel">
          <div className="panel-heading"><div><p className="eyebrow">Historial de bases</p><h2>{datasets.length} versiones registradas</h2><p>La base en uso aparece primero. Las versiones anteriores se conservan para auditoría.</p></div></div>
          <div className="version-toolbar" aria-label="Filtros de versiones">
            <label>Buscar<input type="search" value={datasetQuery} onChange={event => setDatasetQuery(event.target.value)} placeholder="Nombre, periodo o archivo" /></label>
            <label>Estado<select value={datasetStatus} onChange={event => setDatasetStatus(event.target.value)}><option value="todos">Todos</option><option value="activa">En uso</option><option value="archived">Anteriores</option><option value="staging">Procesando</option><option value="failed">Fallidas</option></select></label>
          </div>
          <DatasetHistoryTable datasets={visibleDatasets} activeId={activeDataset?.id} admin={admin} saving={saving} exportingId={exportingId} onExport={exportDataset} onActivate={async id => { setSaving(true); try { await activateDataset(id); setMessage({ type: 'success', text: 'Base activa actualizada.' }); } catch (cause) { setMessage({ type: 'error', text: cause.message }); } finally { setSaving(false); } }}/>
          {filteredDatasets.length > 0 && <nav className="pagination" aria-label="Páginas del historial de bases"><button className="button button--secondary" type="button" disabled={datasetPage === 1} onClick={() => setDatasetPage(page => page - 1)}>Anterior</button><span>Página <strong>{datasetPage}</strong> de <strong>{totalDatasetPages}</strong> · {filteredDatasets.length} resultado{filteredDatasets.length === 1 ? '' : 's'}</span><button className="button button--secondary" type="button" disabled={datasetPage === totalDatasetPages} onClick={() => setDatasetPage(page => page + 1)}>Siguiente</button></nav>}
      </section>
      {admin && <section className="panel advanced-tools">
        <div className="panel-heading"><div><p className="eyebrow">Solo administradores</p><h2>Herramientas avanzadas</h2><p>No son necesarias para el procesamiento habitual.</p></div></div>
        <details className="advanced-disclosure">
          <summary>Importar un resultado que R2 procesó fuera del dashboard</summary>
          <div className="advanced-disclosure__body">
            <div className="panel-heading panel-heading--compact"><p>Utiliza esta opción únicamente para migraciones o integraciones externas.</p><a className="text-link" href={`${import.meta.env.BASE_URL}plantilla_importacion.csv`} download>Descargar plantilla avanzada</a></div>
            <form className="stack-form" onSubmit={submit}>
              <label>Nombre de la encuesta o base<input value={name} onChange={event => setName(event.target.value)} placeholder="Ej. EPEN Lima y Callao" required /></label>
              <label>Periodo<input value={period} onChange={event => setPeriod(event.target.value)} placeholder="Ej. 2027-T1" required /></label>
              <label className="file-field">Archivo CSV procesado<input type="file" accept=".csv,text/csv" onChange={selectFile} /></label>
              <label className="checkbox-field"><input type="checkbox" checked={synthetic} onChange={event => setSynthetic(event.target.checked)} /><span>La base contiene datos sintéticos de prueba</span></label>
              {reading && <p className="helper-text">Validando archivo…</p>}
              {preview && <div className={`import-summary ${preview.errors.length ? 'import-summary--error' : ''}`}><strong>{preview.rows.length} registros válidos</strong><span>{preview.errors.length ? `${preview.errors.length} filas requieren corrección` : 'Estructura compatible con el contrato v1.0'}</span></div>}
              {preview?.errors.length > 0 && <ul className="validation-list">{preview.errors.slice(0, 5).map(error => <li key={error}>{error}</li>)}</ul>}
              <button className="button button--primary" type="submit" disabled={reading || saving || !preview || preview.errors.length > 0}>{saving ? 'Importando…' : 'Importar y usar esta base'}</button>
            </form>
          </div>
        </details>
        {real && activeDataset?.synthetic && <details className="advanced-disclosure">
          <summary>Simular el efecto de un umbral sobre la base sintética activa</summary>
          <div className="advanced-disclosure__body threshold-panel">
            <div><h3>Prueba controlada</h3><p>Estima cuántos registros resolvería R2 y cuántos pasarían a Qwen. No mide precisión ni efectividad.</p></div>
            <div className="threshold-controls"><label>Umbral τ<input type="number" min="0" max="1" step="0.01" value={simulationThreshold} onChange={event => setSimulationThreshold(event.target.value)} /></label><p><strong>{automaticCount}</strong> automáticos · <strong>{Math.max(0, cases.length - automaticCount)}</strong> para Qwen</p><button className="button button--primary" type="button" disabled={saving || !Number.isFinite(thresholdValue) || thresholdValue < 0 || thresholdValue > 1} onClick={async () => { setSaving(true); try { const result = await simulateR2(activeDataset.id, thresholdValue); setMessage({ type: 'success', text: `R2 resolvió ${result.automatic} casos; ${result.pending} quedaron pendientes para Qwen.` }); } catch (cause) { setMessage({ type: 'error', text: cause.message }); } finally { setSaving(false); } }}>Aplicar a esta base sintética</button></div>
            <small>El valor 0,70 es provisional. El umbral productivo se calibrará con datos EPEN reales etiquetados.</small>
          </div>
        </details>}
      </section>}
      <details className="panel process-panel process-disclosure"><summary>Ver cómo funciona el procesamiento completo</summary><ol><li>El operador carga la base original desde esta pantalla.</li><li>El backend crea un trabajo y envía bloques al microservicio R2.</li><li>R2 devuelve Top-K, confianza y versión del modelo.</li><li>Los casos sobre el umbral se resuelven; los difíciles pasan a Qwen automático o quedan para consulta manual.</li><li>Qwen solo cierra automáticamente si confirma el candidato principal de R2; discrepancias y dudas llegan a revisión humana.</li></ol></details>
    </div>
  );
}
