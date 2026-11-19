import { useEffect, useMemo, useRef, useState } from 'react';
import ReferenceBasesManager from './ReferenceBasesManager.jsx';
import { parseRawEpenCsv } from '../../shared/lib/csvImport.js';
import { cancelR2JobReal, exportDatasetReal, listR2JobsReal, startR2JobReal } from '../../shared/api/dataClient.js';
import { useAuth } from '../../app/state/AuthContext.jsx';
import { useData } from '../../app/state/DataContext.jsx';
import EpenIcon from '../../shared/ui/EpenIcon.jsx';
import PageHeader from '../../shared/ui/PageHeader.jsx';
import PanelHeading from '../../shared/ui/PanelHeading.jsx';
import Panel from '../../shared/ui/Panel.jsx';
import Button from '../../shared/ui/Button.jsx';
import Notice from '../../shared/ui/Notice.jsx';
import Field, { inputClass } from '../../shared/ui/Field.jsx';
import { operationalText } from '../../shared/lib/operationalText.js';
import DatasetCsvUpload from '../../shared/components/DatasetCsvUpload.jsx';
import DatasetHistoryTable from '../../shared/components/DatasetHistoryTable.jsx';
import { DEFAULT_R2_THRESHOLD } from '../../shared/config/r2.js';

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

const jobStatusLabel = {
  queued: 'En cola', running: 'Clasificando', qwen_running: 'Consultando IA', completed: 'Completado', failed: 'Falló', cancelled: 'Cancelado',
};

// Estilo de la etiqueta de estado de un trabajo.
function jobTone(job) {
  if (job.cancelRequested) return 'bg-line text-muted';
  if (job.status === 'completed') return 'bg-[#e4f7ec] text-[#05603a]';
  if (job.status === 'failed') return 'bg-danger-soft text-danger';
  return 'bg-brand-soft text-navy';
}

export default function DatasetsPage() {
  const { user } = useAuth();
  const { datasets, activeDataset, activateDataset, reload, real } = useData();
  const [message, setMessage] = useState(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [threshold, setThreshold] = useState(DEFAULT_R2_THRESHOLD);
  const [rawName, setRawName] = useState('');
  const [rawPeriod, setRawPeriod] = useState('');
  const [rawFile, setRawFile] = useState(null);
  const [rawText, setRawText] = useState('');
  const [rawPreview, setRawPreview] = useState(null);
  const [qwenMode, setQwenMode] = useState('automatic');
  const [jobs, setJobs] = useState([]);
  const [exportingId, setExportingId] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [showAllJobs, setShowAllJobs] = useState(false);
  const [jobsPage, setJobsPage] = useState(1);
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
      const result = await startR2JobReal({ name: rawName.trim(), period: rawPeriod.trim(), fileName: rawFile.name, threshold: value, synthetic: false, qwenMode, csvText: rawText });
      setMessage({ type: 'success', text: `Trabajo #${result.jobId} creado con ${result.records} registros. Puedes seguir su avance abajo.` });
      setRawName(''); setRawPeriod(''); setRawFile(null); setRawText(''); setRawPreview(null); setQwenMode('automatic');
      form.reset(); await refreshJobs();
    } catch (cause) { setMessage({ type: 'error', text: cause.message || 'No se pudo iniciar el procesamiento automático.' }); }
    finally { rawSubmitBusy.current = false; setSaving(false); }
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

  const uploadBlocked = saving || reading || !rawPreview || rawPreview.errors.length > 0;

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        icon="database"
        title="Bases de datos"
        description="Procesa bases EPEN y consulta sus versiones."
      />

      {message && <Notice tone={message.type}>{message.text}</Notice>}

      {real && (
        <Panel className="p-5">
          <PanelHeading
            icon="cloud-arrow-up"
            title="Cargar nueva base"
            actions={<a className="text-sm font-semibold text-brand hover:underline" href={`${import.meta.env.BASE_URL}plantilla_base_original.csv`} download>Descargar plantilla original</a>}
          />
          <form className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2" onSubmit={submitRaw}>
            <DatasetCsvUpload
              file={rawFile}
              inputRef={rawInput}
              disabled={saving || reading}
              reading={reading}
              onSelect={selectRawFile}
              onRemove={() => { setRawFile(null); setRawText(''); setRawPreview(null); setMessage(null); rawInput.current.value = ''; }}
            />
            <div className="grid content-start gap-4">
              <Field id="base-nombre" label="Nombre de la encuesta">
                <input id="base-nombre" className={inputClass} maxLength={160} value={rawName} onChange={event => setRawName(event.target.value)} placeholder="Ej. EPEN Lima y Callao" required />
              </Field>
              <Field id="base-periodo" label="Periodo">
                <input id="base-periodo" className={inputClass} maxLength={40} value={rawPeriod} onChange={event => setRawPeriod(event.target.value)} placeholder="Ej. 2027-T2" required />
              </Field>
              <Field id="base-tau" label="Nivel mínimo de confianza (τ)">
                <input id="base-tau" className={inputClass} type="number" min="0" max="1" step="0.01" value={threshold} onChange={event => setThreshold(event.target.value)} required aria-describedby={Number(threshold) !== Number(DEFAULT_R2_THRESHOLD) ? 'base-tau-aviso' : undefined} />
              </Field>
              {Number(threshold) !== Number(DEFAULT_R2_THRESHOLD) && (
                <p id="base-tau-aviso" role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  Cambiaste el umbral sugerido de 0.92. Este cambio modifica qué registros se resuelven automáticamente y cuáles pasan a revisión.
                </p>
              )}
              <Field id="base-ia" label="Asistencia de IA">
                <select id="base-ia" className={inputClass} value={qwenMode} onChange={event => setQwenMode(event.target.value)}>
                  <option value="automatic">Automática (segura)</option>
                  <option value="manual">Manual (a demanda)</option>
                </select>
              </Field>
              <p className="text-sm text-muted">La IA aporta sugerencias para revisión humana; no cierra casos automáticamente.</p>
              {rawPreview && (
                <Notice tone={rawPreview.errors.length ? 'error' : 'success'} title={`${rawPreview.rows.length} registros detectados`}>
                  {rawPreview.errors.length ? `${rawPreview.errors.length} filas requieren corrección` : 'Archivo validado y listo para iniciar'}
                </Notice>
              )}
              {rawPreview?.errors.length > 0 && (
                <ul className="grid list-disc gap-1 pl-5 text-sm text-danger">
                  {rawPreview.errors.slice(0, 5).map((error, index) => <li key={index}>{error}</li>)}
                </ul>
              )}
              <Button type="submit" block disabled={uploadBlocked}>
                <EpenIcon name="file-earmark-code" />
                {saving ? 'Iniciando proceso…' : 'Iniciar clasificación automática'}
              </Button>
            </div>
          </form>
        </Panel>
      )}

      {real && (
        <Panel className="p-5">
          <PanelHeading icon="bar-chart" title="Procesos recientes" />

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {visibleJobs.map(job => {
              const tracksAi = job.qwenMode === 'automatic' && job.qwenPending > 0;
              const totalUnits = job.total + (tracksAi ? job.qwenPending : 0);
              const doneUnits = job.processed + (tracksAi ? job.qwenProcessed : 0);
              const percentage = job.status === 'completed' ? 100 : (totalUnits ? Math.min(100, Math.round(doneUnits / totalUnits * 100)) : 0);
              const label = job.cancelRequested ? 'Cancelando…' : (jobStatusLabel[job.status] || job.status);
              const eta = formatDuration(job.estimatedSecondsRemaining);
              const activeJob = ['queued', 'running', 'qwen_running'].includes(job.status);
              const cancellationAvailable = typeof job.cancelRequested === 'boolean';
              const canCancel = cancellationAvailable && activeJob && !job.cancelRequested;
              const numericThreshold = Number(job.threshold);
              const jobThreshold = Number.isFinite(numericThreshold) ? numericThreshold.toFixed(2).replace('.', ',') : '—';
              const reviewPending = job.manual + job.qwenReview + (job.qwenMode === 'manual' ? job.qwenPending : 0);
              const hasFooter = canCancel || (activeJob && !cancellationAvailable) || job.error;
              return (
                <article key={job.id} data-status={job.status} className="grid content-start gap-4 rounded-xl border border-line bg-surface p-4">
                  <header className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <strong className="block truncate text-ink-strong">#{job.id} · {job.datasetName}</strong>
                      <span className="text-sm text-muted">{job.period}</span>
                    </div>
                    <span className={['shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold', jobTone(job)].join(' ')}>{label}</span>
                  </header>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                    <div><dt className="text-xs text-muted">Umbral</dt><dd className="m-0 font-semibold text-ink-strong">{jobThreshold}</dd></div>
                    <div><dt className="text-xs text-muted">Asistencia de IA</dt><dd className="m-0 font-semibold text-ink-strong">{job.qwenMode === 'automatic' ? 'Automática' : 'Manual'}</dd></div>
                  </dl>

                  <section className="grid grid-cols-1 gap-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted">Avance del trabajo</span>
                      <strong className="text-ink-strong">{percentage} %</strong>
                    </div>
                    <div role="progressbar" aria-label={`Avance del trabajo ${job.id}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage} className="h-2 overflow-hidden rounded-full bg-line">
                      <span className="block h-full rounded-full bg-brand transition-[width]" style={{ width: `${percentage}%` }} />
                    </div>
                    <ul className="grid grid-cols-1 gap-1 text-sm text-muted">
                      <li><strong className="text-ink-strong">{job.automatic}</strong> resueltos automáticamente</li>
                      {tracksAi && <li><strong className="text-ink-strong">{job.qwenResolved}</strong> con asistencia de IA</li>}
                      <li><strong className="text-ink-strong">{reviewPending}</strong> por revisar</li>
                      {eta && <li>Restante <strong className="text-ink-strong">{eta}</strong></li>}
                    </ul>
                  </section>

                  {hasFooter && (
                    <footer className="grid grid-cols-1 gap-2 border-t border-line pt-3">
                      {canCancel && (
                        <div>
                          <Button variant="danger" size="sm" disabled={cancellingId === job.id} onClick={() => cancelJob(job)}>
                            {cancellingId === job.id ? 'Solicitando…' : 'Cancelar trabajo'}
                          </Button>
                        </div>
                      )}
                      {activeJob && !cancellationAvailable && <p className="text-sm text-muted">La cancelación y el tiempo estimado no están disponibles. Solicita al administrador que revise la versión del servicio.</p>}
                      {job.error && <p className="text-sm text-danger">{operationalText(job.error)}</p>}
                    </footer>
                  )}
                </article>
              );
            })}
          </div>
          {!jobs.length && <p className="py-6 text-center text-sm text-muted">Todavía no se iniciaron trabajos.</p>}

          {jobs.length > RECENT_JOBS && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              {showAllJobs ? (
                <>
                  <Button variant="quiet" size="sm" disabled={currentJobsPage === 1} onClick={() => setJobsPage(page => Math.max(1, page - 1))}>Anterior</Button>
                  <span className="text-muted">Página {currentJobsPage} de {jobsPageCount}</span>
                  <Button variant="quiet" size="sm" disabled={currentJobsPage === jobsPageCount} onClick={() => setJobsPage(page => Math.min(jobsPageCount, page + 1))}>Siguiente</Button>
                  <Button variant="quiet" size="sm" onClick={() => { setShowAllJobs(false); setJobsPage(1); }}>Mostrar solo los {RECENT_JOBS} más recientes</Button>
                </>
              ) : (
                <Button variant="quiet" size="sm" onClick={() => { setShowAllJobs(true); setJobsPage(1); }}>Ver los {jobs.length} trabajos</Button>
              )}
            </div>
          )}
        </Panel>
      )}

      <Panel className="p-5">
        <PanelHeading
          icon="clock-history"
          title={`${datasets.length} ${datasets.length === 1 ? 'versión registrada' : 'versiones registradas'}`}
          description="La base en uso aparece primero. Las versiones anteriores se conservan para auditoría."
        />
        <div aria-label="Filtros de versiones" className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <Field id="versiones-buscar" label="Buscar">
            <input id="versiones-buscar" type="search" className={inputClass} value={datasetQuery} onChange={event => setDatasetQuery(event.target.value)} placeholder="Nombre, periodo o archivo" />
          </Field>
          <Field id="versiones-estado" label="Estado">
            <select id="versiones-estado" className={inputClass} value={datasetStatus} onChange={event => setDatasetStatus(event.target.value)}>
              <option value="todos">Todos</option>
              <option value="activa">En uso</option>
              <option value="archived">Anteriores</option>
              <option value="staging">Procesando</option>
              <option value="cancelled">Canceladas</option>
              <option value="failed">Fallidas</option>
            </select>
          </Field>
        </div>
        <DatasetHistoryTable
          datasets={visibleDatasets}
          activeId={activeDataset?.id}
          admin={admin}
          saving={saving}
          exportingId={exportingId}
          onExport={exportDataset}
          onActivate={async id => {
            setSaving(true);
            try {
              await activateDataset(id);
              setMessage({ type: 'success', text: 'Base activa actualizada.' });
            } catch (cause) {
              setMessage({ type: 'error', text: cause.message });
            } finally { setSaving(false); }
          }}
        />
        {filteredDatasets.length > 0 && (
          <nav aria-label="Páginas del historial de bases" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
            <Button variant="secondary" size="sm" disabled={datasetPage === 1} onClick={() => setDatasetPage(page => page - 1)}>Anterior</Button>
            <span>Página <strong className="text-ink-strong">{datasetPage}</strong> de <strong className="text-ink-strong">{totalDatasetPages}</strong> · {filteredDatasets.length} resultado{filteredDatasets.length === 1 ? '' : 's'}</span>
            <Button variant="secondary" size="sm" disabled={datasetPage === totalDatasetPages} onClick={() => setDatasetPage(page => page + 1)}>Siguiente</Button>
          </nav>
        )}
      </Panel>

      {admin && (
        <Panel className="grid grid-cols-1 gap-3 p-5">
          <PanelHeading icon="gear" title="Herramientas avanzadas" description="Solo administradores. No son necesarias para el procesamiento habitual." />
          <details className="rounded-lg border border-line p-4">
            <summary className="cursor-pointer font-semibold text-ink-strong">Importar un resultado procesado fuera del sistema</summary>
            <div className="mt-4"><ReferenceBasesManager /></div>
          </details>

        </Panel>
      )}
    </div>
  );
}
