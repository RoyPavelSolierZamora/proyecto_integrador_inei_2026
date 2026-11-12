import { useEffect, useMemo, useRef, useState } from 'react';
import { parseR2Csv, parseRawEpenCsv } from '../services/csvImport';
import { cancelR2JobReal, exportDatasetReal, listR2JobsReal, startR2JobReal } from '../services/dataClient';
import { useAuth } from '../state/AuthContext';
import { useData } from '../state/DataContext';

import EpenIcon from '../components/epen/EpenIcon';
import ContextHelp from '../components/ContextHelp';
import { operationalText } from '../utils/operationalText';
import DatasetCsvUpload from '../components/epen/DatasetCsvUpload';
import DatasetHistoryTable from '../components/epen/DatasetHistoryTable';
const DATASETS_PER_PAGE = 5;
const formatDuration = seconds => {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `aprox. ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `aprox. ${hours} h${rest ? ` ${rest} min` : ''}`;
};
const formatModelVersion = version => {
  if (!version) return 'Preparando el clasificador';
  if (/^r2-tfidf-linearsvc-calibrado-0\.3/i.test(version)) return 'Clasificador automático v0.3 · calibrado';
  if (/^r2-multivariado-linearsvc-calibrado-0\.4/i.test(version)) return 'Clasificador automático v0.4 · experimental';
  if (/^r2-baseline/i.test(version)) return 'Clasificador automático básico';
  return 'Clasificador automático';
};

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
  const [threshold, setThreshold] = useState('0.90');
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
  const [cancellingId, setCancellingId] = useState(null);
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
    if (!Number.isFinite(value) || value < 0 || value > 1) return setMessage({ type: 'error', text: 'El nivel mínimo de confianza debe estar entre 0 y 1.' });
    rawSubmitBusy.current = true;
    setSaving(true);
    try {
      const result = await startR2JobReal({ name: rawName.trim(), period: rawPeriod.trim(), fileName: rawFile.name, threshold: value, synthetic: rawSynthetic, qwenMode, csvText: rawText });
      setMessage({ type: 'success', text: `Trabajo #${result.jobId} creado con ${result.records} registros. Puedes seguir su avance abajo.` });
      setRawName(''); setRawPeriod(''); setRawFile(null); setRawText(''); setRawPreview(null); setRawSynthetic(true); setQwenMode('automatic');
      form.reset(); await refreshJobs();
    } catch (cause) { setMessage({ type: 'error', text: cause.message || 'No se pudo iniciar el procesamiento automático.' }); }
    finally { rawSubmitBusy.current = false; setSaving(false); }
  }

  async function selectFile(event) {
    const selected = event.target.files?.[0] || null;
    setFile(selected); setPreview(null); setMessage(null);
    if (!selected) return;
    if (selected.size > 5 * 1024 * 1024) return setMessage({ type: 'error', text: 'Esta importación avanzada admite hasta 5 MB. Las bases originales se procesan mediante el flujo automático por lotes.' });
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

  async function cancelJob(job) {
    if (!window.confirm(`¿Cancelar el trabajo #${job.id}? Se conservará y podrá exportarse todo lo ya procesado.`)) return;
    setCancellingId(job.id);
    try {
      await cancelR2JobReal(job.id);
      setMessage({ type: 'success', text: `Se solicitó cancelar el trabajo #${job.id}. La consulta de IA activa se interrumpirá y se conservarán los resultados parciales.` });
      await refreshJobs();
    } catch (cause) { setMessage({ type: 'error', text: cause.message || 'No se pudo cancelar el trabajo.' }); }
    finally { setCancellingId(null); }
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
      <div className="page-heading epen-datasets-heading"><span className="epen-heading-icon"><EpenIcon name="database"/></span><div><h1>Bases de datos</h1><p>Gestiona las bases EPEN, ejecuta la codificación automática y consulta las versiones registradas.</p><small>Las versiones anteriores se conservan para trazabilidad.</small></div></div>
      {message && <div className={`notice notice--${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</div>}
      {real && <div className="epen-datasets-upload-grid"><section className="panel r2-upload-panel">
        <div className="panel-heading"><div><div className="epen-card-title"><EpenIcon name="cloud-arrow-up"/><div><h2>Cargar nueva base</h2><p>Selecciona el CSV original y configura el procesamiento.</p></div></div></div><a className="text-link" href={`${import.meta.env.BASE_URL}plantilla_base_original.csv`} download>Descargar plantilla original</a></div>
        <form className="r2-upload-form" onSubmit={submitRaw}>
          <label>Nombre de la encuesta<input maxLength={160} value={rawName} onChange={event => setRawName(event.target.value)} placeholder="Ej. EPEN Lima y Callao" required /></label>
          <div className="field-with-help"><label>Periodo<input maxLength={40} value={rawPeriod} onChange={event => setRawPeriod(event.target.value)} placeholder="Ej. 2027-T2" required /></label><ContextHelp title="Ayuda sobre el periodo"><p>Indica a qué periodo corresponden los registros para consultarlos después. Usa hasta 40 caracteres, por ejemplo: 2027-T2.</p></ContextHelp></div>
          <div className="field-with-help"><label>Nivel mínimo de confianza<input type="number" min="0" max="1" step="0.01" value={threshold} onChange={event => setThreshold(event.target.value)} required /></label><ContextHelp title="Ayuda sobre la confianza"><p>Valor entre 0 y 1: 0,90 equivale al 90 %. Es el mínimo para aceptar automáticamente una clasificación. Los casos que no lo alcancen necesitarán asistencia o revisión. La confianza no garantiza que el código sea correcto.</p></ContextHelp></div>
          <div className="field-with-help"><label>Asistencia de IA<select value={qwenMode} onChange={event => setQwenMode(event.target.value)}><option value="automatic">Automática</option><option value="manual">Manual</option></select></label><ContextHelp title="Ayuda sobre la asistencia de IA"><p><strong>Automática:</strong> analiza durante el procesamiento los casos que necesitan apoyo. Solo se aceptan sugerencias que cumplen los controles del sistema; las discrepancias requieren revisión humana.</p><p><strong>Manual:</strong> el especialista decide cuándo consultar la IA desde el detalle. Solicitar ayuda no confirma por sí solo un código.</p></ContextHelp></div>
          <DatasetCsvUpload file={rawFile} inputRef={rawInput} disabled={saving || reading} reading={reading} onSelect={selectRawFile} onRemove={() => { setRawFile(null); setRawText(''); setRawPreview(null); setMessage(null); rawInput.current.value = ''; }}/>
          <label className="checkbox-field"><input type="checkbox" checked={rawSynthetic} onChange={event => setRawSynthetic(event.target.checked)} /><span>Datos sintéticos de prueba</span></label>
          {rawPreview && <div className={`import-summary ${rawPreview.errors.length ? 'import-summary--error' : ''}`}><strong>{rawPreview.rows.length} registros detectados</strong><span>{rawPreview.errors.length ? `${rawPreview.errors.length} filas requieren corrección` : 'Lista para iniciar la codificación automática'}</span></div>}
          <button className="button button--primary" type="submit" disabled={saving || reading || !rawPreview || rawPreview.errors.length > 0}><EpenIcon name="file-earmark-code"/>{saving ? 'Iniciando…' : 'Iniciar clasificación'}</button>
          {rawPreview?.errors.length > 0 && <ul className="validation-list">{rawPreview.errors.slice(0, 5).map((error,index)=><li key={index}>{error}</li>)}</ul>}
        </form>
        <p className="epen-upload-note">El sistema procesa el CSV por lotes. Puedes seguir el avance y el tiempo estimado en la sección inferior.</p>
      </section></div>}
      {real && <section className="panel jobs-panel">
        <div className="panel-heading"><div><p className="eyebrow">Seguimiento</p><h2>Procesos recientes</h2><ContextHelp title="Ayuda sobre los estados"><p><strong>En cola:</strong> espera su turno. <strong>Clasificando:</strong> analiza los registros. <strong>Consultando IA:</strong> solicita apoyo para los casos pendientes.</p><p><strong>Completado:</strong> terminó el proceso; puede haber casos por revisar. <strong>Falló:</strong> revisa el error indicado. <strong>Cancelado:</strong> conserva los resultados parciales. <strong>Cancelando:</strong> la interrupción está solicitada.</p></ContextHelp></div></div>
        <div className="job-list">{visibleJobs.map(job => {
          const percentage = job.total ? Math.round(job.processed / job.total * 100) : 0;
          const label = { queued: 'En cola', running: 'Clasificando', qwen_running: 'Consultando IA', completed: 'Completado', failed: 'Falló', cancelled: 'Cancelado' }[job.status] || job.status;
          const qwenPercentage = job.qwenPending ? Math.round(job.qwenProcessed / job.qwenPending * 100) : 0;
          const eta = formatDuration(job.estimatedSecondsRemaining);
          const activeJob = ['queued', 'running', 'qwen_running'].includes(job.status);
          const cancellationAvailable = typeof job.cancelRequested === 'boolean';
          const canCancel = cancellationAvailable && activeJob && !job.cancelRequested;
          return <article className="job-card" key={job.id} data-status={job.status}><div><strong>#{job.id} · {job.datasetName}</strong><span>{job.period} · <span>{formatModelVersion(job.modelVersion)}</span> · IA {job.qwenMode === 'automatic' ? 'automática' : 'manual'}</span></div><span className={`access-state ${job.status === 'completed' ? 'access-state--active' : ''}`}>{job.cancelRequested ? 'Cancelando…' : label}</span><div className="job-progress"><div role="progressbar" aria-label={`Progreso del clasificador automático en el trabajo ${job.id}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}><span style={{ width: `${percentage}%` }} /></div><small><strong>Clasificación automática:</strong> {job.processed}/{job.total} · {percentage}% · {job.automatic} resueltos · {job.qwenPending} derivados a IA · {job.manual} directos a revisión</small>{job.qwenMode === 'automatic' && job.qwenPending > 0 && <><div className="qwen-progress" role="progressbar" aria-label={`Progreso del asistente de IA en el trabajo ${job.id}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={qwenPercentage}><span style={{ width: `${qwenPercentage}%` }} /></div><small><strong>Asistente de IA:</strong> {job.qwenProcessed}/{job.qwenPending} · {qwenPercentage}% · {job.qwenResolved} resueltos · {job.qwenReview} a revisión{eta ? ` · Tiempo restante ${eta}` : ''}</small></>}</div>{canCancel && <div className="job-actions"><button className="button button--danger-secondary" type="button" disabled={cancellingId === job.id} onClick={() => cancelJob(job)}>{cancellingId === job.id ? 'Solicitando…' : 'Cancelar trabajo'}</button></div>}{activeJob && !cancellationAvailable && <p className="job-compatibility-note">La cancelación y el tiempo estimado no están disponibles. Solicita al administrador que revise la versión del servicio.</p>}{job.error && <p className="job-error">{operationalText(job.error)}</p>}</article>;
        })}{!jobs.length && <p className="empty-state empty-state--compact">Todavía no se iniciaron trabajos.</p>}</div>
        {jobs.length > 3 && <button className="button button--quiet jobs-toggle" type="button" onClick={() => setShowAllJobs(value => !value)}>{showAllJobs ? 'Mostrar solo los 3 más recientes' : `Ver los ${jobs.length} trabajos`}</button>}
      </section>}
      <section className="panel versions-panel">
          <div className="panel-heading"><div><p className="eyebrow">Historial de bases</p><h2>{datasets.length} versiones registradas</h2><p>La base en uso aparece primero. Las versiones anteriores se conservan para auditoría.</p></div></div>
          <div className="version-toolbar" aria-label="Filtros de versiones">
            <label>Buscar<input type="search" value={datasetQuery} onChange={event => setDatasetQuery(event.target.value)} placeholder="Nombre, periodo o archivo" /></label>
            <label>Estado<select value={datasetStatus} onChange={event => setDatasetStatus(event.target.value)}><option value="todos">Todos</option><option value="activa">En uso</option><option value="archived">Anteriores</option><option value="staging">Procesando</option><option value="cancelled">Canceladas</option><option value="failed">Fallidas</option></select></label>
          </div>
          <DatasetHistoryTable datasets={visibleDatasets} activeId={activeDataset?.id} admin={admin} saving={saving} exportingId={exportingId} onExport={exportDataset} onActivate={async id => { setSaving(true); try { await activateDataset(id); setMessage({ type: 'success', text: 'Base activa actualizada.' }); } catch (cause) { setMessage({ type: 'error', text: cause.message }); } finally { setSaving(false); } }}/>
          {filteredDatasets.length > 0 && <nav className="pagination" aria-label="Páginas del historial de bases"><button className="button button--secondary" type="button" disabled={datasetPage === 1} onClick={() => setDatasetPage(page => page - 1)}>Anterior</button><span>Página <strong>{datasetPage}</strong> de <strong>{totalDatasetPages}</strong> · {filteredDatasets.length} resultado{filteredDatasets.length === 1 ? '' : 's'}</span><button className="button button--secondary" type="button" disabled={datasetPage === totalDatasetPages} onClick={() => setDatasetPage(page => page + 1)}>Siguiente</button></nav>}
      </section>
      {admin && <section className="panel advanced-tools">
        <div className="panel-heading"><div><p className="eyebrow">Solo administradores</p><h2>Herramientas avanzadas</h2><p>No son necesarias para el procesamiento habitual.</p></div></div>
        <details className="advanced-disclosure">
          <summary>Importar un resultado procesado fuera del sistema</summary>
          <div className="advanced-disclosure__body">
            <div className="panel-heading panel-heading--compact"><p>Utiliza esta opción únicamente para migraciones o integraciones externas.</p><a className="text-link" href={`${import.meta.env.BASE_URL}plantilla_importacion.csv`} download>Descargar plantilla avanzada</a></div>
            <form className="stack-form" onSubmit={submit}>
              <label>Nombre de la encuesta o base<input value={name} onChange={event => setName(event.target.value)} placeholder="Ej. EPEN Lima y Callao" required /></label>
              <label>Periodo<input value={period} onChange={event => setPeriod(event.target.value)} placeholder="Ej. 2027-T1" required /></label>
              <label className="file-field">Archivo CSV procesado<input type="file" accept=".csv,text/csv" onChange={selectFile} /></label>
              <label className="checkbox-field"><input type="checkbox" checked={synthetic} onChange={event => setSynthetic(event.target.checked)} /><span>La base contiene datos sintéticos de prueba</span></label>
              {reading && <p className="helper-text">Validando archivo…</p>}
              {preview && <div className={`import-summary ${preview.errors.length ? 'import-summary--error' : ''}`}><strong>{preview.rows.length} registros válidos</strong><span>{preview.errors.length ? `${preview.errors.length} filas requieren corrección` : 'Archivo validado para importar'}</span></div>}
              {preview?.errors.length > 0 && <ul className="validation-list">{preview.errors.slice(0, 5).map(error => <li key={error}>{error}</li>)}</ul>}
              <button className="button button--primary" type="submit" disabled={reading || saving || !preview || preview.errors.length > 0}>{saving ? 'Importando…' : 'Importar y usar esta base'}</button>
            </form>
          </div>
        </details>
        {real && activeDataset?.synthetic && <details className="advanced-disclosure">
          <summary>Simular el nivel mínimo de confianza en la base sintética activa</summary>
          <div className="advanced-disclosure__body threshold-panel">
            <div><h3>Prueba controlada</h3><p>Estima cuántos registros resolvería el clasificador y cuántos pasarían al asistente de IA. No mide precisión ni efectividad.</p></div>
            <div className="threshold-controls"><label>Nivel de confianza<input type="number" min="0" max="1" step="0.01" value={simulationThreshold} onChange={event => setSimulationThreshold(event.target.value)} /></label><p><strong>{automaticCount}</strong> automáticos · <strong>{Math.max(0, cases.length - automaticCount)}</strong> para IA</p><button className="button button--primary" type="button" disabled={saving || !Number.isFinite(thresholdValue) || thresholdValue < 0 || thresholdValue > 1} onClick={async () => { setSaving(true); try { const result = await simulateR2(activeDataset.id, thresholdValue); setMessage({ type: 'success', text: `El clasificador resolvió ${result.automatic} casos; ${result.pending} quedaron pendientes para IA.` }); } catch (cause) { setMessage({ type: 'error', text: cause.message }); } finally { setSaving(false); } }}>Aplicar a esta base sintética</button></div>
            <small>El valor 0,70 es provisional. El umbral productivo se calibrará con datos EPEN reales etiquetados.</small>
          </div>
        </details>}
      </section>}
    </div>
  );
}
