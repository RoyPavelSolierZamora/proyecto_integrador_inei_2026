import { useEffect, useState } from 'react';
import Button from '../../shared/ui/Button.jsx';
import Notice from '../../shared/ui/Notice.jsx';
import Field, { inputClass } from '../../shared/ui/Field.jsx';
import { parseCodedCsv } from '../../shared/lib/csvImport.js';
import { importReferenceDatasetReal, listReferenceDatasetsReal, setReferenceActivationReal } from '../../shared/api/dataClient.js';

// Bases codificadas de referencia: se importan con el código de analista, quedan guardadas y solo una
// queda activa. La activa es la que usan la comparación de Control de calidad y la exactitud de Métricas.
export default function ReferenceBasesManager() {
  const [references, setReferences] = useState([]);
  const [message, setMessage] = useState(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [name, setName] = useState('');
  const [period, setPeriod] = useState('');
  const [importing, setImporting] = useState(false);
  const [changing, setChanging] = useState(null);

  async function load() {
    try {
      const data = await listReferenceDatasetsReal();
      setReferences(data.references);
    } catch (error) {
      setMessage({ tone: 'error', text: error.message });
    }
  }

  useEffect(() => { load(); }, []);

  async function onFile(event) {
    const chosen = event.target.files?.[0] || null;
    setFile(chosen);
    setPreview(null);
    setMessage(null);
    if (!chosen) return;
    setPreview(parseCodedCsv(await chosen.text()));
    if (!name) setName(chosen.name.replace(/\.csv$/i, '').slice(0, 120));
  }

  async function submitImport() {
    if (!preview?.rows.length || importing) return;
    setImporting(true);
    setMessage(null);
    try {
      const result = await importReferenceDatasetReal({ name: name.trim(), period: period.trim(), fileName: file?.name || '', rows: preview.rows });
      setMessage({ tone: 'success', text: `Base guardada con ${result.records} registros y activada. La anterior queda guardada.` });
      setFile(null);
      setPreview(null);
      await load();
    } catch (error) {
      setMessage({ tone: 'error', text: error.message });
    } finally {
      setImporting(false);
    }
  }

  async function toggle(item) {
    setChanging(item.id);
    setMessage(null);
    try {
      await setReferenceActivationReal(item.id, !item.active);
      setMessage({ tone: 'success', text: item.active ? `“${item.name}” quedó guardada y no activa.` : `“${item.name}” quedó activa. La anterior queda guardada.` });
      await load();
    } catch (error) {
      setMessage({ tone: 'error', text: error.message });
    } finally {
      setChanging(null);
    }
  }

  return (
    <div className="grid gap-5">
      <p className="text-sm text-muted">Columnas: ID_C200, C308, C308A, C309 y C309_COD (código final). La columna <strong>analista</strong> es opcional. Al importar, la base queda activa y la anterior se guarda.</p>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
        <Field id="ref-archivo-b" label="Archivo CSV">
          <input id="ref-archivo-b" type="file" accept=".csv,text/csv" className={inputClass} onChange={onFile} disabled={importing} />
        </Field>
        <Field id="ref-nombre-b" label="Nombre de la base">
          <input id="ref-nombre-b" className={inputClass} value={name} onChange={event => setName(event.target.value)} maxLength={120} disabled={importing} />
        </Field>
        <Field id="ref-periodo-b" label="Periodo">
          <input id="ref-periodo-b" className={inputClass} value={period} onChange={event => setPeriod(event.target.value)} placeholder="Ej. 2026-09" maxLength={40} disabled={importing} />
        </Field>
      </div>
      {preview && preview.errors.length > 0 && <Notice tone="error">{preview.errors.join(' ')}</Notice>}
      {preview && preview.errors.length === 0 && (
        <p className="text-sm text-ink">Se leyeron <strong>{preview.rows.length}</strong> registros. {preview.rows.some(row => row.analyst) ? 'Trae código de analista.' : 'No trae código de analista.'}</p>
      )}
      <div>
        <Button onClick={submitImport} disabled={!preview || preview.errors.length > 0 || !preview.rows.length || !name.trim() || !period.trim() || importing}>
          {importing ? 'Importando…' : 'Importar y activar'}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#f5f8fd] text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Base</th>
              <th scope="col" className="px-4 py-3 font-semibold">Periodo</th>
              <th scope="col" className="px-4 py-3 font-semibold">Registros</th>
              <th scope="col" className="px-4 py-3 font-semibold">Estado</th>
              <th scope="col" className="px-4 py-3 font-semibold"><span className="sr-only">Acción</span></th>
            </tr>
          </thead>
          <tbody>
            {references.map(item => (
              <tr key={item.id} className="border-t border-line align-middle">
                <td className="whitespace-nowrap px-4 py-3"><strong className="text-ink-strong">{item.name}</strong> <small className="text-xs text-muted">v{item.version}</small></td>
                <td className="whitespace-nowrap px-4 py-3">{item.period}</td>
                <td className="whitespace-nowrap px-4 py-3">{item.records}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className={['inline-block rounded-full px-2.5 py-1 text-xs font-semibold', item.active ? 'bg-[#e4f7ec] text-[#05603a]' : 'bg-line text-muted'].join(' ')}>
                    {item.active ? 'Activa' : 'Guardada'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant={item.active ? 'secondary' : 'primary'} size="sm" disabled={changing === item.id} onClick={() => toggle(item)}>
                    {item.active ? 'Desactivar' : 'Activar'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!references.length && <p className="py-6 text-center text-sm text-muted">Todavía no hay bases codificadas guardadas.</p>}
      </div>
    </div>
  );
}
