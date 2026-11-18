import { useState } from 'react';
import Panel from '../../shared/ui/Panel.jsx';
import PanelHeading from '../../shared/ui/PanelHeading.jsx';
import Button from '../../shared/ui/Button.jsx';
import Notice from '../../shared/ui/Notice.jsx';
import Field, { inputClass } from '../../shared/ui/Field.jsx';
import { getQualitySampleReal, submitBlindVerdictReal } from '../../shared/api/dataClient.js';

const SOURCES = [['', 'Todos los orígenes'], ['ml', 'Clasificador automático'], ['llm', 'Asistente de IA'], ['human', 'Decisiones de personas']];
const BANDS = [['', 'Todas las confianzas'], ['>=0.99', '0,99 o más'], ['0.97-0.99', '0,97 a 0,99'], ['0.95-0.97', '0,95 a 0,97'], ['<0.95', 'Menos de 0,95']];
const VALID_CODE = /^[0-9]{4}$/;

// Verificación ciega: el revisor escribe el código que él asignaría. No ve el código propuesto, el origen
// ni el puntaje; así su juicio no se contamina con la decisión que se evalúa. Los filtros de origen y
// confianza sirven para planificar la muestra; el revisor recibe solo el caso.
export default function BlindVerificationPanel({ datasetId, onRegistered }) {
  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(0);
  const [code, setCode] = useState('');
  const [source, setSource] = useState('');
  const [band, setBand] = useState('');
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [registered, setRegistered] = useState(0);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const current = queue[index] || null;
  const codeOk = VALID_CODE.test(code.trim());

  async function loadSample() {
    if (!datasetId) return;
    setLoading(true);
    setMessage(null);
    try {
      const sample = await getQualitySampleReal(datasetId, { limit, source, band, seed: `v${Date.now()}` });
      setQueue(sample.items);
      setIndex(0);
      setCode('');
      setLoadedOnce(true);
      if (!sample.items.length) setMessage({ tone: 'success', text: 'No quedan casos pendientes de verificar con estos filtros.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  }

  async function submit(value) {
    if (!current || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await submitBlindVerdictReal(datasetId, current.decisionId, value);
      setRegistered(count => count + 1);
      setQueue(list => list.filter((_, position) => position !== index));
      setCode('');
      setMessage({ tone: 'success', text: 'Verificación registrada. Pasa al siguiente caso.' });
      if (onRegistered) onRegistered();
    } catch (error) {
      setMessage({ tone: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event) {
    event.preventDefault();
    if (codeOk) submit(code.trim());
  }

  function skip() {
    setCode('');
    setMessage(null);
    setIndex(position => (position + 1 < queue.length ? position + 1 : 0));
  }

  return (
    <Panel className="grid content-start gap-4 p-5">
      <PanelHeading
        title="Verificación ciega"
        description="Asigna el código CIIU que corresponde a cada caso sin ver la propuesta del sistema. Así la muestra mide la calidad real."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
        <Field id="verif-origen" label="Origen a muestrear" hint="Solo para planificar; el revisor no lo ve.">
          <select id="verif-origen" className={inputClass} value={source} onChange={event => setSource(event.target.value)} disabled={loading || busy}>
            {SOURCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field id="verif-banda" label="Confianza">
          <select id="verif-banda" className={inputClass} value={band} onChange={event => setBand(event.target.value)} disabled={loading || busy}>
            {BANDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field id="verif-tamano" label="Casos">
          <input id="verif-tamano" type="number" min="1" max="200" className={inputClass} value={limit} onChange={event => setLimit(Math.min(200, Math.max(1, Number(event.target.value) || 1)))} disabled={loading || busy} />
        </Field>
        <Button onClick={loadSample} disabled={loading || busy}>{loading ? 'Cargando…' : 'Cargar muestra'}</Button>
      </div>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {!loadedOnce && !loading && (
        <p className="text-sm text-muted">Carga una muestra para empezar. Registrados en esta sesión: {registered}.</p>
      )}

      {current && (
        <article aria-label="Caso a verificar" className="grid gap-4 rounded-xl border border-line bg-[#f8fbff] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
            <span>Caso {index + 1} de {queue.length} pendientes</span>
            <span>Registradas en esta sesión: {registered}</span>
          </div>
          <dl className="grid grid-cols-1 gap-3">
            <div className="grid gap-0.5">
              <dt className="text-xs font-semibold text-muted">Actividad económica (P309)</dt>
              <dd className="m-0 text-base text-ink-strong">{current.p309 || 'Sin respuesta'}</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-xs font-semibold text-muted">Ocupación (P308)</dt>
              <dd className="m-0 text-sm text-ink">{current.p308 || 'No informado'}</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-xs font-semibold text-muted">Tareas (P308A)</dt>
              <dd className="m-0 text-sm text-ink">{current.p308a || 'No informado'}</dd>
            </div>
          </dl>

          <form className="grid gap-3 sm:grid-cols-[minmax(0,240px)_auto] sm:items-end" onSubmit={onSubmit}>
            <Field id="verif-codigo" label="Código CIIU que asignas" hint="Cuatro dígitos del catálogo oficial.">
              <input id="verif-codigo" className={inputClass} value={code} onChange={event => setCode(event.target.value.replace(/[^0-9]/g, '').slice(0, 4))} inputMode="numeric" autoComplete="off" placeholder="Ej. 5630" disabled={busy} aria-describedby="verif-codigo-ayuda" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!codeOk || busy}>{busy ? 'Registrando…' : 'Registrar verificación'}</Button>
              <Button variant="secondary" disabled={busy} onClick={() => submit('no_clasificable')}>No clasificable</Button>
              <Button variant="quiet" disabled={busy} onClick={skip}>Omitir</Button>
            </div>
          </form>
        </article>
      )}
    </Panel>
  );
}
