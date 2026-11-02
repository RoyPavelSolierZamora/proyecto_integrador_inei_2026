import { useState } from 'react';
import { parseR2Csv } from '../services/csvImport';
import { useAuth } from '../state/AuthContext';
import { useData } from '../state/DataContext';

const formatDate = value => new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export default function DatasetsPage() {
  const { user } = useAuth();
  const { cases, datasets, activeDataset, activateDataset, importDataset, simulateR2, real } = useData();
  const [name, setName] = useState('');
  const [period, setPeriod] = useState('');
  const [file, setFile] = useState(null);
  const [synthetic, setSynthetic] = useState(true);
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [threshold, setThreshold] = useState('0.70');

  async function selectFile(event) {
    const selected = event.target.files?.[0] || null;
    setFile(selected); setPreview(null); setMessage(null);
    if (!selected) return;
    if (selected.size > 5 * 1024 * 1024) return setMessage({ type: 'error', text: 'Para esta demostración, el archivo no debe superar 5 MB. La carga real se procesará en el backend por lotes.' });
    setReading(true);
    try {
      const result = parseR2Csv(await selected.text());
      setPreview(result);
      if (result.errors.length) setMessage({ type: 'error', text: `Se encontraron ${result.errors.length} observaciones. Corrige el archivo antes de importarlo.` });
    } catch {
      setMessage({ type: 'error', text: 'No se pudo leer el archivo seleccionado.' });
    } finally { setReading(false); }
  }

  const thresholdValue = Number(threshold);
  const automaticCount = Number.isFinite(thresholdValue) ? cases.filter(item => item.confianza_ml >= thresholdValue).length : 0;

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
    <div className="page">
      <div className="page-heading"><div><p className="eyebrow">Administración de datos</p><h1>Bases y periodos</h1><p>Cada encuesta se registra como una versión independiente; la base anterior se conserva para trazabilidad.</p></div></div>
      <div className="notice notice--warning"><strong>Contrato R2 → R3</strong><span>Este importador recibe la salida de R2: id_registro, texto P309 y entre 1 y 5 candidatos CIIU. La base EPEN sin candidatos debe pasar primero por el modelo clásico.</span></div>
      {message && <div className={`notice notice--${message.type}`} role="status">{message.text}</div>}
      <div className="admin-grid admin-grid--data">
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Nueva versión</p><h2>Importar CSV procesado por R2</h2></div><a className="text-link" href="/plantilla_importacion.csv" download>Descargar plantilla</a></div>
          <form className="stack-form" onSubmit={submit}>
            <label>Nombre de la encuesta o base<input value={name} onChange={event => setName(event.target.value)} placeholder="Ej. EPEN Lima y Callao" required /></label>
            <label>Periodo<input value={period} onChange={event => setPeriod(event.target.value)} placeholder="Ej. 2027-T1" required /></label>
            <label className="file-field">Archivo CSV<input type="file" accept=".csv,text/csv" onChange={selectFile} /></label>
            <label className="checkbox-field"><input type="checkbox" checked={synthetic} onChange={event => setSynthetic(event.target.checked)} /><span>La base contiene datos sintéticos de prueba</span></label>
            {reading && <p className="helper-text">Validando archivo…</p>}
            {preview && <div className={`import-summary ${preview.errors.length ? 'import-summary--error' : ''}`}><strong>{preview.rows.length} registros válidos</strong><span>{preview.errors.length ? `${preview.errors.length} filas requieren corrección` : 'Estructura compatible con el contrato v1.0'}</span></div>}
            {preview?.errors.length > 0 && <ul className="validation-list">{preview.errors.slice(0, 5).map(error => <li key={error}>{error}</li>)}</ul>}
            <button className="button button--primary" type="submit" disabled={reading || saving || !preview || preview.errors.length > 0}>{saving ? 'Importando…' : 'Importar y usar esta base'}</button>
          </form>
        </section>
        <section className="panel panel--user-list">
          <div className="panel-heading"><div><p className="eyebrow">Versiones disponibles</p><h2>{datasets.length} bases registradas</h2></div></div>
          <div className="dataset-list">
            {[...datasets].reverse().map(dataset => (
              <article className={`dataset-card ${dataset.id === activeDataset?.id ? 'dataset-card--active' : ''}`} key={dataset.id}>
                <div><strong>{dataset.name}</strong><span>{dataset.period} · {dataset.records} registros {dataset.synthetic ? '· SINTÉTICA' : ''}</span><small>{dataset.fileName} · {formatDate(dataset.importedAt)} · {dataset.importedBy}</small></div>
                {dataset.id === activeDataset?.id ? <span className="access-state access-state--active">En uso</span> : <button className="button button--secondary" type="button" disabled={saving} onClick={async () => { setSaving(true); try { await activateDataset(dataset.id); setMessage({ type: 'success', text: 'Base activa actualizada.' }); } catch (cause) { setMessage({ type: 'error', text: cause.message }); } finally { setSaving(false); } }}>Usar base</button>}
              </article>
            ))}
          </div>
        </section>
      </div>
      {real && activeDataset?.synthetic && <section className="panel threshold-panel">
        <div><p className="eyebrow">Prueba controlada</p><h2>Simular política de umbral R2</h2><p>Solo para esta base sintética. R2 resolverá el candidato principal cuando su confianza alcance el umbral; los demás casos quedarán pendientes para Qwen.</p></div>
        <div className="threshold-controls"><label>Umbral τ<input type="number" min="0" max="1" step="0.01" value={threshold} onChange={event => setThreshold(event.target.value)} /></label><p><strong>{automaticCount}</strong> automáticos · <strong>{Math.max(0, cases.length - automaticCount)}</strong> para Qwen</p><button className="button button--primary" type="button" disabled={saving || !Number.isFinite(thresholdValue) || thresholdValue < 0 || thresholdValue > 1} onClick={async () => { setSaving(true); try { const result = await simulateR2(activeDataset.id, thresholdValue); setMessage({ type: 'success', text: `R2 resolvió ${result.automatic} casos; ${result.pending} quedaron pendientes para Qwen.` }); } catch (cause) { setMessage({ type: 'error', text: cause.message }); } finally { setSaving(false); } }}>Aplicar umbral a esta base</button></div>
        <small>El valor 0,70 es demostrativo. El umbral productivo debe calibrarse con datos EPEN reales y validación independiente.</small>
      </section>}
      <section className="panel process-panel"><p className="eyebrow">Flujo cuando llegue una nueva encuesta</p><ol><li>R1 recibe y resguarda la base original.</li><li>R2 genera el Top-K de candidatos por cada P309.</li><li>El administrador valida e importa la salida con una nueva etiqueta de periodo.</li><li>El sistema activa esa versión sin borrar las anteriores.</li><li>R3 procesa únicamente los casos derivados y el dashboard muestra la nueva bandeja.</li></ol></section>
    </div>
  );
}
