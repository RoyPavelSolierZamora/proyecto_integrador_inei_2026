import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ContextHelp from '../../shared/ui/ContextHelp.jsx';
import Panel from '../../shared/ui/Panel.jsx';
import PanelHeading from '../../shared/ui/PanelHeading.jsx';
import Button from '../../shared/ui/Button.jsx';
import Notice from '../../shared/ui/Notice.jsx';
import Field, { inputClass } from '../../shared/ui/Field.jsx';
import StatusBadge from '../../shared/ui/StatusBadge.jsx';
import { operationalText } from '../../shared/lib/operationalText.js';
import HistoricalEvidence from './HistoricalEvidence.jsx';
import SimilarCasesPanel from './SimilarCasesPanel.jsx';
import QualityReviewPanel from '../calidad/QualityReviewPanel.jsx';
import CodingRulesPanel from '../criterios/CodingRulesPanel.jsx';
import useDatasetWorkspace from '../../shared/hooks/useDatasetWorkspace.js';
import { useAuth } from '../../app/state/AuthContext.jsx';
import { useData } from '../../app/state/DataContext.jsx';

const survey = [
  ['P309', 'Actividad económica', 'p309', 'No informado'],
  ['C309_1', 'Sector primario', 'c309_1', 'No informado'],
  ['P308', 'Ocupación', 'p308', 'No informado'],
  ['P308A', 'Tareas realizadas', 'p308a', 'No informado'],
  ['C310', 'Categoría de ocupación', 'c310', 'No informado'],
  ['C311', 'Tipo de entidad', 'c311', 'No informado'],
  ['C366', 'Nivel educativo', 'c366', 'No informado'],
];

// Pantalla de revisión de un caso: respuesta original, códigos sugeridos y decisión.
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
        .then(page => {
          if (active) {
            setCatalogResults(page.rows);
            setCatalogTotal(page.total);
            if (catalogList.current) catalogList.current.scrollTop = 0;
          }
        })
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

  if (workspaceLoading) return <Notice>Cargando registro…</Notice>;
  if (!item) {
    return (
      <div className="grid grid-cols-1 gap-3">
        <h1 className="text-2xl font-bold text-ink-strong">Registro no encontrado</h1>
        <p className="text-sm text-muted">{workspaceError || 'El registro no pertenece a la base seleccionada.'}</p>
        <Link to={backTarget} className="text-sm font-semibold text-brand hover:underline">Volver a la bandeja</Link>
      </div>
    );
  }

  async function runQwen() {
    setLoading(true);
    setError('');
    setNotice('');
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
    setLoading(true);
    setError('');
    try {
      const currentIndex = cases.findIndex(entry => entry.id_registro === item.id_registro);
      const requiresAttention = entry => entry.id_registro !== item.id_registro && ['pendiente', 'revision'].includes(entry.estado);
      const nextItem = cases.slice(currentIndex + 1).find(requiresAttention) || cases.slice(0, Math.max(0, currentIndex)).find(requiresAttention);
      await decide(selectedDataset.id, item.id_registro, action, code, justification, user);
      await refresh();
      const savedMessage = action === 'derivación' ? 'El caso fue enviado a revisión humana.' : `Decisión guardada: ${code}.`;
      navigate(
        nextItem ? `/casos/${encodeURIComponent(nextItem.id_registro)}?dataset=${selectedDataset.id}` : backTarget,
        { replace: true, state: { notice: nextItem ? `${savedMessage} Se abrió el siguiente caso pendiente.` : `${savedMessage} No quedan más casos pendientes.` } },
      );
    } catch (cause) {
      setError(cause.message || 'No se pudo guardar la decisión.');
    } finally { setLoading(false); }
  }

  async function correct() {
    if (!catalogSelected) return;
    setSelected(catalogSelected);
    await save('corrección', catalogSelected);
  }

  const confidence = Math.round(item.confianza_ml * 100);
  const unsupported = item.evidencia_r2?.calibracion === 'softmax-sin-calibrar';

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="text-sm font-semibold text-brand hover:underline" onClick={() => navigate(backTarget)}>← Volver a codificación</button>
        <StatusBadge status={item.estado} />
      </div>

      <header className="grid grid-cols-1 gap-1">
        <span className="text-sm font-semibold text-muted">{selectedDataset.name}</span>
        <h1 className="text-2xl font-bold tracking-tight text-ink-strong md:text-3xl">Revisión de actividad económica</h1>
        <span className="break-all text-sm text-muted">Registro: {item.id_registro}</span>
      </header>

      {notice && <Notice tone="success">{notice}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Panel className="grid content-start gap-4 p-5">
          <PanelHeading title="Respuesta de la encuesta" description="Información original, sin cambios." />
          <dl className="grid grid-cols-1 gap-3">
            {survey.map(([code, label, key, fallback]) => (
              <div key={code} className="grid grid-cols-1 gap-0.5 border-b border-line pb-3 last:border-0">
                <dt className="text-xs font-semibold text-muted">{code} · {label}</dt>
                <dd className="m-0 text-sm text-ink-strong">{item[key] || fallback}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel className="grid content-start gap-4 p-5">
          <PanelHeading
            title="Códigos sugeridos"
            description={`${confidence} % ${unsupported ? 'puntaje sin calibrar' : 'máximo'}`}
            actions={canDecide && (
              <Button variant="secondary" onClick={runQwen} disabled={loading || !item.candidatos.length}>
                {loading ? 'Procesando…' : 'Consultar IA'}
              </Button>
            )}
          />
          <ContextHelp title="¿Cómo interpretar los códigos y la confianza?">
            <p>El código CIIU identifica una actividad económica. El porcentaje indica la confianza de la sugerencia, no garantiza su corrección. Compara la respuesta original y la información complementaria antes de confirmar.</p>
          </ContextHelp>

          <div role="radiogroup" aria-label="Códigos sugeridos" className="grid grid-cols-1 gap-2">
            {item.candidatos.map(candidate => {
              const isSelected = selected === candidate.codigo;
              return (
                <label
                  key={candidate.codigo}
                  className={[
                    'grid cursor-pointer grid-cols-[auto_64px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3 text-sm',
                    isSelected ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:border-[#9bb8d8]',
                  ].join(' ')}
                >
                  <input type="radio" name="candidate" value={candidate.codigo} checked={isSelected} onChange={() => setSelected(candidate.codigo)} className="size-4" />
                  <span className="font-bold text-ink-strong">{candidate.codigo}</span>
                  <span className="text-muted">{candidate.descripcion}</span>
                  <strong className="text-ink-strong">{Math.round(candidate.prob * 100)} %</strong>
                </label>
              );
            })}
          </div>
          {!item.candidatos.length && (
            <p className="text-sm text-muted">El clasificador no produjo candidatos. Este caso requiere selección manual desde el catálogo.</p>
          )}
          {item.qwen && (
            <div className="grid grid-cols-1 gap-1 rounded-xl border border-brand-soft bg-[#f8fbff] p-4">
              <div className="flex items-baseline gap-2 text-sm">
                <span className="text-muted">IA sugiere</span>
                <strong className="text-ink-strong">{item.qwen.codigo || 'Revisión'}</strong>
              </div>
              <p className="text-sm text-ink">{operationalText(item.qwen.justificacion)}</p>
            </div>
          )}
        </Panel>
      </div>

      {canDecide && (
        <section aria-label="Decisión del analista" className="flex md:sticky md:bottom-0 md:z-10 flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-lg md:flex-row md:items-center md:justify-between">
          <div className="grid grid-cols-1 gap-0.5">
            <span className="text-xs font-semibold text-muted">Código seleccionado</span>
            <strong className="text-lg text-ink-strong">{selected || 'Sin código seleccionado'}</strong>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!selected || loading} onClick={() => save('confirmación')}>Confirmar y siguiente</Button>
            <Button variant="secondary" onClick={() => { setCatalogSelected(''); correctionDialog.current?.showModal(); }}>Catálogo CIIU</Button>
            <Button variant="danger" disabled={loading} onClick={() => save('derivación')}>Revisión</Button>
          </div>
        </section>
      )}

      <HistoricalEvidence evidence={item.evidencia_r2} />

      <div className="grid grid-cols-1 gap-3">
        <details className="group rounded-2xl border border-line bg-surface p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
            <div className="grid grid-cols-1 gap-0.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand">Consulta opcional</p>
              <h2 className="text-base font-bold text-ink-strong">Antecedentes y criterios relacionados</h2>
            </div>
            <span className="text-sm font-semibold text-brand group-open:hidden">Ver contexto</span>
          </summary>
          <div className="mt-4 grid gap-4">
            <CodingRulesPanel datasetId={selectedDataset.id} caseId={item.id_registro} />
            <SimilarCasesPanel datasetId={selectedDataset.id} caseId={item.id_registro} />
          </div>
        </details>

        {['supervisor', 'auditor', 'admin'].includes(user.role) && (
          <details className="group rounded-2xl border border-line bg-surface p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
              <div className="grid grid-cols-1 gap-0.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">Solo para muestras supervisadas</p>
                <h2 className="text-base font-bold text-ink-strong">Control de calidad formal</h2>
              </div>
              <span className="text-sm font-semibold text-brand group-open:hidden">Evaluar muestra</span>
            </summary>
            <div className="mt-4">
              <QualityReviewPanel datasetId={selectedDataset.id} caseId={item.id_registro} currentCode={item.codigo_final} canReview={canReviewQuality} onReviewed={refresh} />
            </div>
          </details>
        )}
      </div>

      <dialog
        ref={correctionDialog}
        onClose={() => { setCatalogQuery(''); setCatalogSelected(''); setCatalogTotal(0); }}
        className="m-auto w-[min(640px,calc(100vw-24px))] max-h-[85vh] rounded-2xl border border-line bg-surface p-0 shadow-2xl backdrop:bg-navy-strong/40"
      >
        <div className="grid max-h-[85vh] grid-rows-[auto_auto_minmax(0,1fr)_auto_auto] gap-3 p-5">
          <form method="dialog" className="flex items-start justify-between gap-3">
            <div className="grid grid-cols-1 gap-0.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand">Catálogo CIIU Rev.4</p>
              <h2 className="text-lg font-bold text-ink-strong">Seleccionar otro código CIIU</h2>
            </div>
            <Button type="submit" variant="quiet" size="sm" aria-label="Cerrar">Cerrar</Button>
          </form>

          <Field id="catalogo-buscar" label="Buscar por código o descripción">
            <input id="catalogo-buscar" autoFocus type="search" className={inputClass} value={catalogQuery} onChange={event => setCatalogQuery(event.target.value)} placeholder="Ej. 4711 o venta al por menor" />
          </Field>

          <div role="listbox" aria-label="Códigos CIIU encontrados" ref={catalogList} className="grid min-h-0 content-start gap-1 overflow-y-auto rounded-lg border border-line p-1">
            {catalogResults.map(row => {
              const isSelected = catalogSelected === row.codigo;
              return (
                <button
                  key={row.codigo}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => setCatalogSelected(row.codigo)}
                  className={['grid grid-cols-[64px_minmax(0,1fr)] gap-3 rounded-lg px-3 py-2 text-left text-sm', isSelected ? 'bg-brand-soft' : 'hover:bg-[#f5f8fd]'].join(' ')}
                >
                  <strong className="text-ink-strong">{row.codigo}</strong>
                  <span className="text-muted">{row.descripcion}</span>
                </button>
              );
            })}
            {!catalogResults.length && !catalogLoading && <p className="py-6 text-center text-sm text-muted">No se encontraron códigos con ese criterio.</p>}
          </div>

          <div aria-live="polite" className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
            <span>
              {catalogLoading ? 'Buscando códigos…' : catalogResults.length < catalogTotal
                ? `${catalogResults.length} de ${catalogTotal} ${catalogQuery.trim() ? 'coincidencias' : 'clases del catálogo'}`
                : `${catalogTotal} ${catalogQuery.trim() ? 'coincidencia' : 'clase'}${catalogTotal === 1 ? '' : 's'}${catalogQuery.trim() ? '' : ' en el catálogo'}`}
            </span>
            {catalogResults.length < catalogTotal && (
              <Button variant="secondary" size="sm" onClick={loadMoreCatalog} disabled={catalogMore}>{catalogMore ? 'Cargando…' : 'Cargar más'}</Button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <span className="text-sm text-ink">{catalogSelected ? `Código seleccionado: ${catalogSelected}` : 'Selecciona un código del catálogo'}</span>
            <Button disabled={!catalogSelected || loading} onClick={correct}>{loading ? 'Guardando…' : 'Usar código y continuar'}</Button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
