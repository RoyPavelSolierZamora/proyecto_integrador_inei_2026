import { useEffect, useRef, useState } from 'react';
import { getCaseReferenceReal } from '../../shared/api/dataClient.js';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ContextHelp from '../../shared/ui/ContextHelp.jsx';
import Panel from '../../shared/ui/Panel.jsx';
import PanelHeading from '../../shared/ui/PanelHeading.jsx';
import Button, { buttonClass } from '../../shared/ui/Button.jsx';
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
  const [catalogOpen, setCatalogOpen] = useState(false);
  const catalogList = useRef(null);
  const canDecide = ['analista', 'supervisor', 'admin'].includes(user.role);
  const canReviewQuality = ['supervisor', 'admin'].includes(user.role);
  const catalogPageSize = 500;

  useEffect(() => {
    if (item) setSelected(item.codigo_final || item.candidatos?.[0]?.codigo || '');
  }, [item?.id, item?.codigo_final]);

  // Referencia de la base codificada para este registro, si fue importada.
  const [referenceInfo, setReferenceInfo] = useState(null);
  useEffect(() => {
    if (!item || !selectedDataset?.id) return undefined;
    let active = true;
    getCaseReferenceReal(selectedDataset.id, item.id_registro)
      .then(data => { if (active) setReferenceInfo(data); })
      .catch(() => { if (active) setReferenceInfo(null); });
    return () => { active = false; };
  }, [item?.id_registro, selectedDataset?.id]);

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

  function closeCatalog() {
    setCatalogOpen(false);
    setCatalogQuery('');
    setCatalogSelected('');
    setCatalogTotal(0);
  }

  // La tecla Escape también cierra el catálogo mientras está abierto.
  useEffect(() => {
    if (!catalogOpen) return undefined;
    const onKey = event => { if (event.key === 'Escape') closeCatalog(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [catalogOpen]);

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
        <Link to={backTarget} className={buttonClass({ variant: 'secondary', size: 'sm', className: 'justify-self-start' })}><span aria-hidden="true">←</span>Volver a la bandeja</Link>
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
  const aiCode = item.qwen?.codigo || null;
  const aiPending = !aiCode || item.qwen?.decision === 'revision_humana';
  const aiCandidate = aiCode ? item.candidatos.find(candidate => candidate.codigo === aiCode) : null;

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" size="sm" onClick={() => navigate(backTarget)}><span aria-hidden="true">←</span>Volver a codificación</Button>
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

          {referenceInfo?.reference && (
            <div aria-label="Referencia de la base codificada" className="grid gap-1 rounded-xl border border-line bg-surface p-3 text-sm">
              <span className="font-semibold text-ink-strong">Base codificada: {referenceInfo.reference.name}</span>
              <span className="text-muted">Código de referencia <strong className="text-ink-strong">{referenceInfo.reference.code}</strong>{referenceInfo.reference.analyst ? ` · analista ${referenceInfo.reference.analyst}` : ' · sin código de analista'}</span>
              <span className={referenceInfo.reference.agrees ? 'font-semibold text-[#05603a]' : 'font-semibold text-danger'}>{referenceInfo.reference.agrees ? 'Coincide con el código del sistema.' : 'No coincide con el código del sistema: revísalo antes de confirmar.'}</span>
            </div>
          )}

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
                  <span className="grid gap-1 text-muted">
                    {candidate.codigo === aiCode && <span className="w-fit rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-white">Propuesta de IA</span>}
                    <span>{candidate.descripcion}</span>
                  </span>
                  <strong className="text-ink-strong">{Math.round(candidate.prob * 100)} %</strong>
                </label>
              );
            })}
          </div>
          {!item.candidatos.length && (
            <p className="text-sm text-muted">El clasificador no produjo candidatos. Este caso requiere selección manual desde el catálogo.</p>
          )}
          {item.qwen && (
            <section aria-label="Sugerencia de la IA" className="grid gap-2 rounded-xl border-2 border-brand bg-[#f8fbff] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink-strong">Sugerencia de la IA</span>
                <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-navy">Requiere confirmación humana</span>
              </div>
              {aiPending ? (
                <p className="text-sm font-semibold text-ink-strong">La IA pide revisión humana.</p>
              ) : (
                <p className="text-sm text-ink">
                  <strong className="text-base text-ink-strong">{aiCode}</strong>
                  {aiCandidate ? ` · ${aiCandidate.descripcion}` : ' · Código fuera de las propuestas del clasificador'}
                </p>
              )}
              <p className="text-sm text-muted">{operationalText(item.qwen.justificacion)}</p>
              {!aiPending && aiCandidate && canDecide && (
                <div>
                  <Button variant="secondary" size="sm" disabled={selected === aiCode} onClick={() => setSelected(aiCode)}>
                    {selected === aiCode ? 'Sugerencia seleccionada' : 'Usar la sugerencia de IA'}
                  </Button>
                </div>
              )}
            </section>
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
            <Button variant="secondary" onClick={() => { setCatalogSelected(''); setCatalogOpen(true); }}>Catálogo CIIU</Button>
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

      {catalogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-strong/40 p-3"
          onMouseDown={event => { if (event.target === event.currentTarget) closeCatalog(); }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="catalogo-titulo" className="flex max-h-[min(85vh,680px)] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl">
            <div className="grid shrink-0 content-start gap-4 p-6 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="grid grid-cols-1 gap-0.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand">Catálogo CIIU Rev.4</p>
                  <h2 id="catalogo-titulo" className="text-lg font-bold text-ink-strong">Seleccionar otro código CIIU</h2>
                </div>
                <Button type="button" variant="quiet" size="sm" aria-label="Cerrar" onClick={closeCatalog}>Cerrar</Button>
              </div>
              <Field id="catalogo-buscar" label="Buscar por código o descripción">
                <input id="catalogo-buscar" autoFocus type="search" className={inputClass} value={catalogQuery} onChange={event => setCatalogQuery(event.target.value)} placeholder="Ej. 4711 o venta al por menor" />
              </Field>
            </div>

            <div role="listbox" aria-label="Códigos CIIU encontrados" ref={catalogList} className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto px-6 py-2">
              {catalogResults.map(row => {
                const isSelected = catalogSelected === row.codigo;
                return (
                  <button
                    key={row.codigo}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => setCatalogSelected(row.codigo)}
                    className={['grid grid-cols-[72px_minmax(0,1fr)] items-baseline gap-3 rounded-xl border px-4 py-3 text-left text-sm transition', isSelected ? 'border-2 border-brand bg-brand-soft' : 'border-[#c7d8ee] bg-white hover:border-brand hover:bg-brand-soft/40'].join(' ')}
                  >
                    <strong className="text-ink-strong">{row.codigo}</strong>
                    <span className="text-muted">{row.descripcion}</span>
                  </button>
                );
              })}
              {!catalogResults.length && !catalogLoading && <p className="py-6 text-center text-sm text-muted">No se encontraron códigos con ese criterio.</p>}
            </div>

            <div aria-live="polite" className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-6 pb-3 pt-2 text-sm text-muted">
              <span>
                {catalogLoading ? 'Buscando códigos…' : catalogResults.length < catalogTotal
                  ? `${catalogResults.length} de ${catalogTotal} ${catalogQuery.trim() ? 'coincidencias' : 'clases del catálogo'}`
                  : `${catalogTotal} ${catalogQuery.trim() ? 'coincidencia' : 'clase'}${catalogTotal === 1 ? '' : 's'}${catalogQuery.trim() ? '' : ' en el catálogo'}`}
              </span>
              {catalogResults.length < catalogTotal && (
                <Button variant="secondary" size="sm" onClick={loadMoreCatalog} disabled={catalogMore}>{catalogMore ? 'Cargando…' : 'Cargar más'}</Button>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-6 py-4">
              <span className="text-sm text-ink">{catalogSelected ? `Código seleccionado: ${catalogSelected}` : 'Selecciona un código del catálogo'}</span>
              <Button disabled={!catalogSelected || loading} onClick={correct}>{loading ? 'Guardando…' : 'Usar código y continuar'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
