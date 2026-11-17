import { useEffect, useMemo, useRef, useState } from 'react';
import { parseR2Csv, parseRawEpenCsv } from '../services/csvImport';
import { cancelR2JobReal, exportDatasetReal, getR2Health, listR2JobsReal, startR2JobReal } from '../services/dataClient';
import { useAuth } from '../state/AuthContext';
import { useData } from '../state/DataContext';

import EpenIcon from '../components/epen/EpenIcon';
import PageHeader from '../components/epen/PageHeader';
import PanelHeading from '../components/epen/PanelHeading';
import ContextHelp from '../components/ContextHelp';
import { operationalText } from '../utils/operationalText';
import DatasetCsvUpload from '../components/epen/DatasetCsvUpload';
import DatasetHistoryTable from '../components/epen/DatasetHistoryTable';
import { DEFAULT_R2_THRESHOLD, R2_THRESHOLD_GUIDANCE } from '../config/r2';
const DATASETS_PER_PAGE = 5;
const RECENT_JOBS = 2;
const JOBS_PAGE_SIZE = 4;
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
  if (/^beto-v2-experimental-no-calibrado/i.test(version)) return 'BETO V2 · puntaje sin calibrar';
  if (/^r2-tfidf-linearsvc-calibrado-0\.5/i.test(version)) return 'Clasificador automático v0.5 · histórico ampliado';
  if (/^r2-tfidf-linearsvc-calibrado-0\.3/i.test(version)) return 'Clasificador automático v0.3 · calibrado';
  if (/^r2-multivariado-linearsvc-calibrado-0\.4/i.test(version)) return 'Clasificador automático v0.4 · experimental';
  if (/^r2-baseline/i.test(version)) return 'Clasificador automático básico';
  return 'Clasificador automático';
};

export default function DatasetsPage() {
  const { user } = useAuth();
  const { datasets, activeDataset, activateDataset, importDataset, updateDatasetSynthetic, reload, real } = useData();
  const [processedFiles, setProcessedFiles] = useState([]);
  const [synthetic, setSynthetic] = useState(false);
  const [message, setMessage] = useState(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [threshold, setThreshold] = useState(DEFAULT_R2_THRESHOLD);
  const [aiThreshold, setAiThreshold] = useState('');
  const [rawName, setRawName] = useState('');
  const [rawPeriod, setRawPeriod] = useState('');
  const [rawFile, setRawFile] = useState(null);
  const [rawText, setRawText] = useState('');
  const [rawPreview, setRawPreview] = useState(null);
  const [rawSynthetic, setRawSynthetic] = useState(false);
  const [qwenMode, setQwenMode] = useState('automatic');
  const [jobs, setJobs] = useState([]);
  const [exportingId, setExportingId] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [showAllJobs, setShowAllJobs] = useState(false);
  const [jobsPage, setJobsPage] = useState(1);
  const [datasetQuery, setDatasetQuery] = useState('');
  const [datasetStatus, setDatasetStatus] = useState('todos');
  const [datasetPage, setDatasetPage] = useState(1);
  const [datasetTypeId, setDatasetTypeId] = useState('');
  const [betoActive, setBetoActive] = useState(false);
  const rawInput = useRef(null);
  const rawSubmitBusy = useRef(false);
  const admin = user.role === 'admin';

  useEffect(() => {
    let active = true;
    getR2Health().then(health => { if (active) setBetoActive(String(health.modelo || '').startsWith('beto-v2-experimental-no-calibrado+')); }).catch(() => {});
    return () => { active = false; };
  }, []);

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
    const aiValue = aiThreshold.trim() === '' ? '' : Number(aiThreshold);
    if (aiValue !== '' && (!Number.isFinite(aiValue) || aiValue < 0 || aiValue > 1)) return setMessage({ type: 'error', text: 'El umbral de IA debe estar entre 0 y 1, o quedar vacío.' });
    rawSubmitBusy.current = true;
    setSaving(true);
    try {
      const result = await startR2JobReal({ name: rawName.trim(), period: rawPeriod.trim(), fileName: rawFile.name, threshold: value, aiThreshold: aiValue, synthetic: rawSynthetic, qwenMode, csvText: rawText });
      setMessage({ type: 'success', text: `Trabajo #${result.jobId} creado con ${result.records} registros. Puedes seguir su avance abajo.` });
      setRawName(''); setRawPeriod(''); setRawFile(null); setRawText(''); setRawPreview(null); setRawSynthetic(false); setQwenMode('automatic'); setAiThreshold('');
      form.reset(); await refreshJobs();
    } catch (cause) { setMessage({ type: 'error', text: cause.message || 'No se pudo iniciar el procesamiento automático.' }); }
    finally { rawSubmitBusy.current = false; setSaving(false); }
  }

  async function selectFile(event) {
    const selected = [...(event.target.files || [])];
    setProcessedFiles([]); setMessage(null);
    if (!selected.length) return;
    if (selected.length > 12) return setMessage({ type: 'error', text: 'Importa hasta 12 archivos por lote para poder revisar cada resultado.' });
    if (selected.some(item => item.size > 5 * 1024 * 1024)) return setMessage({ type: 'error', text: 'Cada archivo procesado puede pesar hasta 5 MB.' });
    setReading(true);
    try {
      const rows = await Promise.all(selected.map(async item => {
        const preview = parseR2Csv(await item.text());
        const base = item.name.replace(/\.csv$/i, '').replace(/[_-]+/g, ' ').trim();
        const periodMatch = item.name.match(/(20\d{2})[ _-]?(?:T|Q)?([1-4]|0?[1-9]|1[0-2])?/i);
        const period = periodMatch ? `${periodMatch[1]}${periodMatch[2] ? `-${periodMatch[2]}` : ''}` : '';
        return { key: `${item.name}-${item.lastModified}`, file: item, name: base, period, preview };
      }));
      setProcessedFiles(rows);
      const invalid = rows.filter(item => !item.preview.rows.length || item.preview.errors.length);
      if (invalid.length) setMessage({ type: 'error', text: `${invalid.length} archivo(s) requieren corrección antes de importar el lote.` });
    } catch {
      setMessage({ type: 'error', text: 'No se pudieron leer los archivos seleccionados.' });
    } finally { setReading(false); }
  }

  function updateProcessedFile(key, field, value) {
    setProcessedFiles(current => current.map(item => item.key === key ? { ...item, [field]: value } : item));
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

  async function toggleSynthetic(dataset) {
    const nextSynthetic = !dataset.synthetic;
    const target = nextSynthetic ? 'una base sintética de prueba' : 'una base con datos reales';
    if (!window.confirm(`¿Marcar «${dataset.name}» como ${target}? Esta clasificación habilita o restringe las acciones de prueba.`)) return;
    setSaving(true);
    try {
      await updateDatasetSynthetic(dataset.id, nextSynthetic);
      setMessage({ type: 'success', text: nextSynthetic ? 'La base quedó marcada como sintética.' : 'La base quedó marcada como datos reales.' });
    } catch (cause) { setMessage({ type: 'error', text: cause.message || 'No se pudo actualizar la clasificación de la base.' }); }
    finally { setSaving(false); }
  }

  const jobsPageCount = Math.max(1, Math.ceil(jobs.length / JOBS_PAGE_SIZE));
  const currentJobsPage = Math.min(jobsPage, jobsPageCount);
  const visibleJobs = showAllJobs
    ? jobs.slice((currentJobsPage - 1) * JOBS_PAGE_SIZE, currentJobsPage * JOBS_PAGE_SIZE)
    : jobs.slice(0, RECENT_JOBS);
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
    if (!processedFiles.length) return setMessage({ type: 'error', text: 'Selecciona al menos un CSV procesado.' });
    if (processedFiles.some(item => !item.name.trim() || !item.period.trim())) return setMessage({ type: 'error', text: 'Completa el nombre y el periodo de cada archivo.' });
    if (processedFiles.some(item => !item.preview?.rows.length || item.preview.errors.length)) return setMessage({ type: 'error', text: 'Corrige los archivos observados antes de importar el lote.' });
    setSaving(true);
    try {
      let records = 0;
      for (const item of processedFiles) {
        await importDataset({ name: item.name.trim(), period: item.period.trim(), fileName: item.file.name, rows: item.preview.rows, synthetic }, user);
        records += item.preview.rows.length;
      }
      setMessage({ type: 'success', text: `Se importaron ${processedFiles.length} archivo(s) y ${records.toLocaleString('es-PE')} registros. La última versión quedó en uso.` });
      setProcessedFiles([]); setSynthetic(false);
      form.reset();
    } catch (cause) {
      setMessage({ type: 'error', text: cause.message || 'No se pudo importar la base.' });
    } finally { setSaving(false); }
  }

  return (
    <div className="page epen-datasets">
      <PageHeader
        icon="database"
        eyebrow="Datos y procesamiento"
        title="Bases de datos"
        description="Gestiona las bases EPEN, ejecuta la codificación automática y consulta las versiones registradas."
        meta="Las versiones anteriores se conservan para trazabilidad."
      />
      {message && <div className={`notice notice--${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</div>}
      {betoActive && <div className="notice" role="status">BETO está activo. BETO cierra automáticamente los casos con puntaje igual o superior al umbral de cada trabajo. Si el trabajo define un umbral de IA, la IA puede cerrar la primera propuesta de los casos cuyo puntaje alcance ese umbral. Lo demás va a revisión humana.</div>}
      {real && <div className="epen-datasets-upload-grid"><section className="panel r2-upload-panel">
        <PanelHeading icon="cloud-arrow-up" title="Cargar nueva base" description="Selecciona el CSV original y configura el procesamiento." actions={<a className="text-link" href={`${import.meta.env.BASE_URL}plantilla_base_original.csv`} download>Descargar plantilla original</a>} />
        <form className="r2-upload-form" onSubmit={submitRaw}>
          <DatasetCsvUpload file={rawFile} inputRef={rawInput} disabled={saving || reading} reading={reading} onSelect={selectRawFile} onRemove={() => { setRawFile(null); setRawText(''); setRawPreview(null); setMessage(null); rawInput.current.value = ''; }}/>
          <label>Nombre de la encuesta<input maxLength={160} value={rawName} onChange={event => setRawName(event.target.value)} placeholder="Ej. EPEN Lima y Callao" required /></label>
          <label>Periodo<input maxLength={40} value={rawPeriod} onChange={event => setRawPeriod(event.target.value)} placeholder="Ej. 2027-T2" required /></label>
          <label>Nivel mínimo de confianza (τ)<input type="number" min="0" max="1" step="0.01" value={threshold} onChange={event => setThreshold(event.target.value)} required /></label>
          <label>Asistencia de IA<select value={qwenMode} onChange={event => setQwenMode(event.target.value)}><option value="automatic">Automática (segura)</option><option value="manual">Manual (a demanda)</option></select></label>
          <label>Umbral de cierre por IA (opcional)<input type="number" min="0" max="1" step="0.01" value={aiThreshold} onChange={event => setAiThreshold(event.target.value)} placeholder="Vacío: la IA solo sugiere" /></label>
          <label className="checkbox-field"><input type="checkbox" checked={rawSynthetic} onChange={event => setRawSynthetic(event.target.checked)} /><span>Marcar como datos sintéticos de prueba</span></label>
          {rawPreview && <div className={`import-summary ${rawPreview.errors.length ? 'import-summary--error' : ''}`}><strong>{rawPreview.rows.length} registros detectados</strong><span>{rawPreview.errors.length ? `${rawPreview.errors.length} filas requieren corrección` : 'Archivo validado y listo para iniciar'}</span></div>}
          <button className="button button--primary" type="submit" disabled={saving || reading || !rawPreview || rawPreview.errors.length > 0}><EpenIcon name="file-earmark-code"/>{saving ? 'Iniciando proceso…' : 'Iniciar clasificación automática'}</button>
          {rawPreview?.errors.length > 0 && <ul className="validation-list">{rawPreview.errors.slice(0, 5).map((error,index)=><li key={index}>{error}</li>)}</ul>}
        </form>
        <p className="epen-upload-note">El sistema procesa el CSV por lotes. Puedes seguir el avance y el tiempo estimado en la sección inferior.</p>
      </section></div>}
      {real && <section className="panel jobs-panel">
        <PanelHeading eyebrow="Seguimiento" title="Procesos recientes" />
        <ContextHelp title="Ayuda sobre los estados"><p><strong>En cola:</strong> espera su turno. <strong>Clasificando:</strong> analiza los registros. <strong>Consultando IA:</strong> solicita apoyo para los casos pendientes.</p><p><strong>Completado:</strong> terminó el proceso; puede haber casos por revisar. <strong>Falló:</strong> revisa el error indicado. <strong>Cancelado:</strong> conserva los resultados parciales. <strong>Cancelando:</strong> la interrupción está solicitada.</p></ContextHelp>
        <div className="job-list">{visibleJobs.map(job => {
          const tracksAi = job.qwenMode === 'automatic' && job.qwenPending > 0;
          const totalUnits = job.total + (tracksAi ? job.qwenPending : 0);
          const doneUnits = job.processed + (tracksAi ? job.qwenProcessed : 0);
          const percentage = job.status === 'completed' ? 100 : (totalUnits ? Math.min(100, Math.round(doneUnits / totalUnits * 100)) : 0);
          const label = { queued: 'En cola', running: 'Clasificando', qwen_running: 'Consultando IA', completed: 'Completado', failed: 'Falló', cancelled: 'Cancelado' }[job.status] || job.status;
          const eta = formatDuration(job.estimatedSecondsRemaining);
          const activeJob = ['queued', 'running', 'qwen_running'].includes(job.status);
          const cancellationAvailable = typeof job.cancelRequested === 'boolean';
          const canCancel = cancellationAvailable && activeJob && !job.cancelRequested;
          const numericThreshold = Number(job.threshold);
          const jobThreshold = Number.isFinite(numericThreshold) ? numericThreshold.toFixed(2).replace('.', ',') : '—';
          const reviewPending = job.manual + job.qwenReview + (job.qwenMode === 'manual' ? job.qwenPending : 0);
          return <article className="job-card" key={job.id} data-status={job.status}>
            <header className="job-card__head">
              <div className="job-card__title"><strong>#{job.id} · {job.datasetName}</strong><span>{job.period}</span></div>
              <span className={`access-state ${job.status === 'completed' ? 'access-state--active' : ''}`}>{job.cancelRequested ? 'Cancelando…' : label}</span>
            </header>
            <dl className="job-card__facts">
              <div><dt>Umbral</dt><dd>{jobThreshold}</dd></div>
              <div><dt>Umbral de IA</dt><dd>{job.aiThreshold === null || job.aiThreshold === undefined ? 'Sin cierre por IA' : Number(job.aiThreshold).toFixed(2).replace('.', ',')}</dd></div>
              <div><dt>Asistencia de IA</dt><dd>{job.qwenMode === 'automatic' ? 'Automática' : 'Manual'}</dd></div>
              <div className="job-card__facts-wide"><dt>Clasificador</dt><dd title={job.modelVersion || undefined}>{formatModelVersion(job.modelVersion)}</dd></div>
            </dl>
            <section className="job-phase">
              <div className="job-phase__head"><span>Avance del trabajo</span><strong>{percentage} %</strong></div>
              <div className="job-progress" role="progressbar" aria-label={`Avance del trabajo ${job.id}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}><span style={{ width: `${percentage}%` }} /></div>
              <ul className="job-phase__metrics">
                <li><strong>{job.automatic}</strong> resueltos automáticamente</li>
                {tracksAi && <li><strong>{job.qwenResolved}</strong> con asistencia de IA</li>}
                <li><strong>{reviewPending}</strong> por revisar</li>
                {eta && <li>Restante <strong>{eta}</strong></li>}
              </ul>
            </section>
            {(canCancel || (activeJob && !cancellationAvailable) || job.error) && <footer className="job-card__footer">
              {canCancel && <button className="button button--danger-secondary" type="button" disabled={cancellingId === job.id} onClick={() => cancelJob(job)}>{cancellingId === job.id ? 'Solicitando…' : 'Cancelar trabajo'}</button>}
              {activeJob && !cancellationAvailable && <p className="job-compatibility-note">La cancelación y el tiempo estimado no están disponibles. Solicita al administrador que revise la versión del servicio.</p>}
              {job.error && <p className="job-error">{operationalText(job.error)}</p>}
            </footer>}
          </article>;
        })}{!jobs.length && <p className="empty-state empty-state--compact">Todavía no se iniciaron trabajos.</p>}</div>
        {jobs.length > RECENT_JOBS && <div className="jobs-pager">
          {showAllJobs ? <>
            <button className="button button--quiet" type="button" disabled={currentJobsPage === 1} onClick={() => setJobsPage(page => Math.max(1, page - 1))}>Anterior</button>
            <span className="jobs-pager__status">Página {currentJobsPage} de {jobsPageCount}</span>
            <button className="button button--quiet" type="button" disabled={currentJobsPage === jobsPageCount} onClick={() => setJobsPage(page => Math.min(jobsPageCount, page + 1))}>Siguiente</button>
            <button className="button button--quiet" type="button" onClick={() => { setShowAllJobs(false); setJobsPage(1); }}>Mostrar solo los {RECENT_JOBS} más recientes</button>
          </> : <button className="button button--quiet" type="button" onClick={() => { setShowAllJobs(true); setJobsPage(1); }}>Ver los {jobs.length} trabajos</button>}
        </div>}
      </section>}
      <section className="panel versions-panel">
          <PanelHeading eyebrow="Historial de bases" title={`${datasets.length} versiones registradas`} description="La base en uso aparece primero. Las versiones anteriores se conservan para auditoría." />
          <div className="version-toolbar" aria-label="Filtros de versiones">
            <label>Buscar<input type="search" value={datasetQuery} onChange={event => setDatasetQuery(event.target.value)} placeholder="Nombre, periodo o archivo" /></label>
            <label>Estado<select value={datasetStatus} onChange={event => setDatasetStatus(event.target.value)}><option value="todos">Todos</option><option value="activa">En uso</option><option value="archived">Anteriores</option><option value="staging">Procesando</option><option value="cancelled">Canceladas</option><option value="failed">Fallidas</option></select></label>
          </div>
          <DatasetHistoryTable datasets={visibleDatasets} activeId={activeDataset?.id} admin={admin} saving={saving} exportingId={exportingId} onExport={exportDataset} onActivate={async id => { setSaving(true); try { await activateDataset(id); setMessage({ type: 'success', text: 'Base activa actualizada.' }); } catch (cause) { setMessage({ type: 'error', text: cause.message }); } finally { setSaving(false); } }}/>
          {filteredDatasets.length > 0 && <nav className="pagination" aria-label="Páginas del historial de bases"><button className="button button--secondary" type="button" disabled={datasetPage === 1} onClick={() => setDatasetPage(page => page - 1)}>Anterior</button><span>Página <strong>{datasetPage}</strong> de <strong>{totalDatasetPages}</strong> · {filteredDatasets.length} resultado{filteredDatasets.length === 1 ? '' : 's'}</span><button className="button button--secondary" type="button" disabled={datasetPage === totalDatasetPages} onClick={() => setDatasetPage(page => page + 1)}>Siguiente</button></nav>}
      </section>
      {admin && <section className="panel advanced-tools">
        <PanelHeading eyebrow="Solo administradores" title="Herramientas avanzadas" description="No son necesarias para el procesamiento habitual." />
        <details className="advanced-disclosure">
          <summary>Corregir el tipo de datos de una versión</summary>
          <div className="advanced-disclosure__body dataset-type-tool">
            <p>“Datos de prueba” habilita simulaciones y evita confundir resultados sintéticos con información real.</p>
            <label>Versión<select value={datasetTypeId} onChange={event => setDatasetTypeId(event.target.value)}><option value="">Seleccionar base</option>{datasets.map(dataset => <option key={dataset.id} value={dataset.id}>{dataset.name} · {dataset.period} · {dataset.synthetic ? 'Prueba' : 'Real'}</option>)}</select></label>
            {datasetTypeId && (() => { const selected = datasets.find(dataset => String(dataset.id) === String(datasetTypeId)); return selected ? <button className="button button--secondary" type="button" disabled={saving} onClick={() => toggleSynthetic(selected)}>{selected.synthetic ? 'Marcar como datos reales' : 'Marcar como datos de prueba'}</button> : null; })()}
          </div>
        </details>
        <details className="advanced-disclosure">
          <summary>Importar un resultado procesado fuera del sistema</summary>
          <div className="advanced-disclosure__body">
            <div className="panel-heading panel-heading--compact"><p>Utiliza esta opción únicamente para migraciones o integraciones externas.</p><a className="text-link" href={`${import.meta.env.BASE_URL}plantilla_importacion.csv`} download>Descargar plantilla avanzada</a></div>
            <form className="stack-form processed-import-form" onSubmit={submit}>
              <label className="file-field">Archivos CSV procesados<input type="file" multiple accept=".csv,text/csv" onChange={selectFile} /></label>
              {reading && <p className="helper-text">Validando archivo…</p>}
              {processedFiles.length > 0 && <div className="processed-import-list">{processedFiles.map(item => <article key={item.key} className={item.preview.errors.length ? 'is-invalid' : ''}>
                <header><strong>{item.file.name}</strong><span>{item.preview.rows.length.toLocaleString('es-PE')} registros</span></header>
                <div><label>Nombre de la base<input value={item.name} onChange={event => updateProcessedFile(item.key, 'name', event.target.value)} required /></label><label>Periodo<input value={item.period} onChange={event => updateProcessedFile(item.key, 'period', event.target.value)} placeholder="Ej. 2027-T1" required /></label></div>
                {item.preview.errors.length > 0 && <small>{item.preview.errors.length} observación(es): {item.preview.errors.slice(0, 2).join(' ')}</small>}
              </article>)}</div>}
              <label className="checkbox-field"><input type="checkbox" checked={synthetic} onChange={event => setSynthetic(event.target.checked)} /><span>Marcar todo este lote como datos de prueba</span></label>
              <p className="helper-text">Cada archivo crea una versión independiente. Se importan en orden y la última queda en uso.</p>
              <button className="button button--primary" type="submit" disabled={reading || saving || !processedFiles.length || processedFiles.some(item => item.preview.errors.length > 0)}>{saving ? 'Importando lote…' : `Importar ${processedFiles.length || ''} archivo${processedFiles.length === 1 ? '' : 's'}`}</button>
            </form>
          </div>
        </details>
      </section>}
    </div>
  );
}
