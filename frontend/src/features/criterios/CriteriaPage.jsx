import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../shared/ui/PageHeader.jsx';
import PanelHeading from '../../shared/ui/PanelHeading.jsx';
import Panel from '../../shared/ui/Panel.jsx';
import Button from '../../shared/ui/Button.jsx';
import Notice from '../../shared/ui/Notice.jsx';
import Field, { inputClass } from '../../shared/ui/Field.jsx';
import {
  createCatalogChangeRequestReal, createCodingRuleReal, listCatalogChangeRequestsReal,
  listCodingRulesReal, reviewCatalogChangeRequestReal, searchCatalogReal,
  updateCodingRuleReal, updateCodingRuleStatusReal,
} from '../../shared/api/dataClient.js';
import { useAuth } from '../../app/state/AuthContext.jsx';

const emptyRule = { code: '', title: '', pattern: '', occupationalContext: '', guidance: '', positiveExamples: '', negativeExamples: '', sourceReference: '' };
const emptyCatalogRequest = { type: 'add', code: '', description: '', justification: '', sourceReference: '' };
const statusLabel = { draft: 'Borrador', pending: 'Pendiente', active: 'Vigente', retired: 'Retirado', approved: 'Aprobada', rejected: 'Rechazada' };
const statusTone = {
  draft: 'bg-line text-muted',
  pending: 'bg-[#fff4d6] text-[#7a4b00]',
  active: 'bg-[#e4f7ec] text-[#05603a]',
  retired: 'bg-danger-soft text-danger',
  approved: 'bg-[#e4f7ec] text-[#05603a]',
  rejected: 'bg-danger-soft text-danger',
};
const typeLabel = { add: 'Nuevo código', update: 'Actualizar descripción', deactivate: 'Desactivar código' };
// Campo de código con números monoespaciados para leerlo sin ambigüedad.
const inputMono = `${inputClass} font-mono tracking-widest`;
const tabs = [['rules', 'Criterios de decisión'], ['catalog', 'Cambios al catálogo']];

const tabClass = active => [
  'min-h-10 border-b-2 px-3 text-sm font-semibold',
  active ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink-strong',
].join(' ');

const Badge = ({ status }) => (
  <span className={['w-fit rounded-full px-2.5 py-1 text-xs font-semibold', statusTone[status] || 'bg-line text-muted'].join(' ')}>
    {statusLabel[status] || status}
  </span>
);

// Gobierno de la clasificación: criterios de decisión y cambios al catálogo CIIU.
// Un criterio vigente guía la revisión; no reclasifica bases ni reentrena el modelo.
export default function CriteriaPage() {
  const { user } = useAuth();
  const canEdit = ['supervisor', 'admin'].includes(user.role);
  const [tab, setTab] = useState('rules');
  const [rules, setRules] = useState([]);
  const [requests, setRequests] = useState([]);
  const [status, setStatus] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [showCatalogForm, setShowCatalogForm] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalog, setCatalog] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyRule);
  const [catalogForm, setCatalogForm] = useState(emptyCatalogRequest);

  async function loadRules() {
    const result = await listCodingRulesReal(status);
    setRules(result.rules || []);
  }

  async function loadRequests() {
    const result = await listCatalogChangeRequestsReal();
    setRequests(result.requests || []);
  }

  useEffect(() => { loadRules().catch(error => setMessage(error.message)); }, [status]);
  useEffect(() => { loadRequests().catch(error => setMessage(error.message)); }, []);
  useEffect(() => {
    if (!catalogQuery.trim()) { setCatalog([]); return undefined; }
    let active = true;
    const timer = setTimeout(() => searchCatalogReal(catalogQuery).then(rows => { if (active) setCatalog(rows.slice(0, 6)); }).catch(() => setCatalog([])), 180);
    return () => { active = false; clearTimeout(timer); };
  }, [catalogQuery]);

  const selectedDescription = useMemo(() => catalog.find(item => item.codigo === form.code)?.descripcion || '', [catalog, form.code]);
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const updateCatalog = (key, value) => setCatalogForm(current => ({ ...current, [key]: value }));

  function resetRuleForm() {
    setEditingId(null);
    setForm(emptyRule);
    setCatalogQuery('');
    setShowRuleForm(false);
  }

  async function submitRule(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const payload = { ...form, positiveExamples: form.positiveExamples.split('\n'), negativeExamples: form.negativeExamples.split('\n') };
      if (editingId) await updateCodingRuleReal(editingId, payload);
      else await createCodingRuleReal(payload);
      resetRuleForm();
      await loadRules();
      setMessage(editingId ? 'Criterio actualizado.' : 'Criterio guardado como borrador.');
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }

  async function submitCatalogRequest(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await createCatalogChangeRequestReal(catalogForm);
      setCatalogForm(emptyCatalogRequest);
      setShowCatalogForm(false);
      await loadRequests();
      setMessage('Solicitud enviada para revisión administrativa.');
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }

  function editRule(rule) {
    setEditingId(rule.id);
    setShowRuleForm(true);
    setTab('rules');
    setForm({
      code: rule.code,
      title: rule.title,
      pattern: rule.pattern,
      occupationalContext: rule.occupationalContext || '',
      guidance: rule.guidance,
      positiveExamples: (rule.positiveExamples || []).join('\n'),
      negativeExamples: (rule.negativeExamples || []).join('\n'),
      sourceReference: rule.sourceReference || '',
    });
    setCatalogQuery(`${rule.code} · ${rule.codeDescription}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function changeRuleStatus(id, next) {
    setSaving(true);
    setMessage('');
    try {
      await updateCodingRuleStatusReal(id, next);
      await loadRules();
      setMessage(`Criterio actualizado: ${statusLabel[next]}.`);
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }

  async function reviewRequest(id, next) {
    if (!window.confirm(next === 'approved' ? '¿Aplicar este cambio al catálogo activo?' : '¿Rechazar esta solicitud?')) return;
    setSaving(true);
    setMessage('');
    try {
      await reviewCatalogChangeRequestReal(id, next, next === 'rejected' ? 'Solicitud rechazada durante la revisión administrativa.' : '');
      await loadRequests();
      setMessage(next === 'approved' ? 'Cambio aplicado al catálogo.' : 'Solicitud rechazada.');
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }

  const messageIsSuccess = /guardado|actualizado|enviada|aplicado/i.test(message);

  return (
    <div className="grid gap-6">
      <PageHeader icon="journal-check" title="Catálogo y criterios" description="Gobierna códigos y reglas sin alterar silenciosamente decisiones anteriores." />

      <div role="tablist" aria-label="Gobierno de clasificación" className="flex gap-1 border-b border-line">
        {tabs.map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={tabClass(tab === value)}>
            {label}
          </button>
        ))}
      </div>

      {message && <Notice tone={messageIsSuccess ? 'success' : 'error'}>{message}</Notice>}

      {tab === 'rules' && (
        <>
          <Notice title="Un criterio vigente guía la revisión.">
            No reclasifica bases anteriores ni reentrena el modelo. Sus ejemplos deben incorporarse a un conjunto validado antes de entrenar una nueva versión.
          </Notice>

          <Panel className="grid gap-4 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <PanelHeading title="Criterios registrados" description={`${rules.length} resultado${rules.length === 1 ? '' : 's'}`} />
              <div className="flex flex-wrap items-end gap-2">
                {canEdit && (
                  <Button onClick={() => { setEditingId(null); setForm(emptyRule); setCatalogQuery(''); setShowRuleForm(value => !value); }}>
                    {showRuleForm ? 'Cerrar formulario' : 'Crear criterio'}
                  </Button>
                )}
                <Field id="criterios-estado" label="Estado" className="min-w-40">
                  <select id="criterios-estado" className={inputClass} value={status} onChange={event => setStatus(event.target.value)}>
                    <option value="">Todos</option>
                    <option value="draft">Borradores</option>
                    <option value="pending">Pendientes</option>
                    <option value="active">Vigentes</option>
                    <option value="retired">Retirados</option>
                  </select>
                </Field>
              </div>
            </div>

            {showRuleForm && canEdit && (
              <form className="grid gap-4 rounded-xl border border-line bg-[#f8fbff] p-4" onSubmit={submitRule}>
                <h3 className="text-base font-bold text-ink-strong">{editingId ? `Editar criterio #${editingId}` : 'Nuevo criterio'}</h3>

                <div className="grid gap-2">
                  <Field id="criterio-codigo" label="Vincular código CIIU">
                    <input id="criterio-codigo" type="search" className={inputClass} value={catalogQuery} onChange={event => setCatalogQuery(event.target.value)} placeholder="Escribe código o actividad" required={!form.code} />
                  </Field>
                  {catalog.length > 0 && (
                    <div className="grid gap-1 rounded-lg border border-line bg-surface p-1">
                      {catalog.map(item => (
                        <button
                          type="button"
                          key={item.codigo}
                          onClick={() => { update('code', item.codigo); setCatalogQuery(`${item.codigo} · ${item.descripcion}`); setCatalog([]); }}
                          className={['grid grid-cols-[56px_minmax(0,1fr)] gap-2 rounded-md px-3 py-2 text-left text-sm', form.code === item.codigo ? 'bg-brand-soft' : 'hover:bg-[#f5f8fd]'].join(' ')}
                        >
                          <strong className="text-ink-strong">{item.codigo}</strong>
                          <span className="text-muted">{item.descripcion}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <small className="text-xs text-muted">
                    {form.code ? `${form.code} · ${selectedDescription || catalogQuery.split('·').slice(1).join('·').trim()}` : 'Selecciona un código del catálogo activo.'}
                  </small>
                </div>

                <Field id="criterio-titulo" label="Título">
                  <input id="criterio-titulo" maxLength={160} className={inputClass} value={form.title} onChange={event => update('title', event.target.value)} required />
                </Field>
                <Field id="criterio-cuando" label="Cuándo se aplica">
                  <textarea id="criterio-cuando" rows={2} className={inputClass} value={form.pattern} onChange={event => update('pattern', event.target.value)} required />
                </Field>
                <Field id="criterio-guia" label="Criterio de decisión">
                  <textarea id="criterio-guia" rows={3} className={inputClass} value={form.guidance} onChange={event => update('guidance', event.target.value)} required />
                </Field>

                <details className="rounded-lg border border-line bg-surface p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-brand">Contexto, ejemplos y fuente</summary>
                  <div className="mt-3 grid gap-4">
                    <Field id="criterio-contexto" label="Contexto ocupacional">
                      <textarea id="criterio-contexto" rows={2} className={inputClass} value={form.occupationalContext} onChange={event => update('occupationalContext', event.target.value)} />
                    </Field>
                    <Field id="criterio-ejemplos" label="Ejemplos válidos, uno por línea">
                      <textarea id="criterio-ejemplos" rows={3} className={inputClass} value={form.positiveExamples} onChange={event => update('positiveExamples', event.target.value)} />
                    </Field>
                    <Field id="criterio-contraejemplos" label="Contraejemplos, uno por línea">
                      <textarea id="criterio-contraejemplos" rows={3} className={inputClass} value={form.negativeExamples} onChange={event => update('negativeExamples', event.target.value)} />
                    </Field>
                    <Field id="criterio-fuente" label="Fuente o referencia">
                      <input id="criterio-fuente" className={inputClass} value={form.sourceReference} onChange={event => update('sourceReference', event.target.value)} />
                    </Field>
                  </div>
                </details>

                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={saving || !form.code}>{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Guardar borrador'}</Button>
                  {editingId && <Button variant="secondary" onClick={resetRuleForm}>Cancelar</Button>}
                </div>
              </form>
            )}

            <div className="grid gap-3">
              {rules.map(rule => {
                const canManageOwn = user.role === 'admin' || Number(rule.createdById) === Number(user.id);
                return (
                  <article key={rule.id} className="grid gap-3 rounded-xl border border-line bg-surface p-4">
                    <header className="flex flex-wrap items-start justify-between gap-2">
                      <div className="grid gap-1">
                        <Badge status={rule.status} />
                        <h3 className="text-base font-bold text-ink-strong">{rule.code} · {rule.title}</h3>
                        <p className="text-sm text-muted">{rule.codeDescription}</p>
                      </div>
                      <span className="text-xs text-muted">#{rule.id}</span>
                    </header>
                    <div className="grid gap-1 rounded-lg bg-[#f8fbff] p-3 text-sm">
                      <strong className="text-ink-strong">{rule.pattern}</strong>
                      <p className="text-ink">{rule.guidance}</p>
                    </div>
                    <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                      <span>{rule.createdBy}{rule.approvedBy ? ` · aprobó ${rule.approvedBy}` : ''}</span>
                      <div className="flex flex-wrap gap-2">
                        {canEdit && canManageOwn && rule.status === 'draft' && <Button variant="quiet" size="sm" disabled={saving} onClick={() => editRule(rule)}>Editar</Button>}
                        {canEdit && canManageOwn && rule.status === 'draft' && <Button variant="secondary" size="sm" disabled={saving} onClick={() => changeRuleStatus(rule.id, 'pending')}>Enviar</Button>}
                        {user.role === 'admin' && rule.status === 'pending' && <Button size="sm" disabled={saving} onClick={() => changeRuleStatus(rule.id, 'active')}>Aprobar</Button>}
                        {user.role === 'admin' && rule.status === 'active' && <Button variant="danger" size="sm" disabled={saving} onClick={() => changeRuleStatus(rule.id, 'retired')}>Retirar</Button>}
                      </div>
                    </footer>
                  </article>
                );
              })}
            </div>
            {!rules.length && <p className="py-6 text-center text-sm text-muted">No hay criterios con este estado.</p>}
          </Panel>
        </>
      )}

      {tab === 'catalog' && (
        <>
          <section aria-label="Impacto de un cambio de catálogo" className="grid gap-3 md:grid-cols-3">
            <Panel className="grid gap-1 p-4"><strong className="text-sm text-ink-strong">Disponible de inmediato</strong><span className="text-sm text-muted">Selección manual y nuevos criterios.</span></Panel>
            <Panel className="grid gap-1 p-4"><strong className="text-sm text-ink-strong">Requiere una nueva versión</strong><span className="text-sm text-muted">Reentrenar el clasificador y sincronizar el catálogo de la asistencia.</span></Panel>
            <Panel className="grid gap-1 p-4"><strong className="text-sm text-ink-strong">No es retroactivo</strong><span className="text-sm text-muted">Las bases anteriores conservan su trazabilidad.</span></Panel>
          </section>

          <Panel className="grid gap-4 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <PanelHeading title="Solicitudes de catálogo" description="Solo un administrador puede aplicar un cambio." />
              {canEdit && <Button onClick={() => setShowCatalogForm(value => !value)}>{showCatalogForm ? 'Cerrar formulario' : 'Solicitar cambio'}</Button>}
            </div>

            {showCatalogForm && canEdit && (
              <form className="grid gap-4 rounded-xl border border-line bg-[#f8fbff] p-4" onSubmit={submitCatalogRequest}>
                <h3 className="text-base font-bold text-ink-strong">Propuesta documentada</h3>
                <Field id="catalogo-tipo" label="Tipo de cambio">
                  <select id="catalogo-tipo" className={inputClass} value={catalogForm.type} onChange={event => updateCatalog('type', event.target.value)}>
                    <option value="add">Agregar código</option>
                    <option value="update">Actualizar descripción</option>
                    <option value="deactivate">Desactivar código</option>
                  </select>
                </Field>
                <Field id="catalogo-codigo" label="Código de cuatro dígitos">
                  <input id="catalogo-codigo" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} className={inputMono} value={catalogForm.code} onChange={event => updateCatalog('code', event.target.value.replace(/\D/g, '').slice(0, 4))} required />
                </Field>
                {catalogForm.type !== 'deactivate' && (
                  <Field id="catalogo-descripcion" label="Descripción oficial">
                    <textarea id="catalogo-descripcion" rows={2} className={inputClass} value={catalogForm.description} onChange={event => updateCatalog('description', event.target.value)} required />
                  </Field>
                )}
                <Field id="catalogo-motivo" label="Motivo del cambio">
                  <textarea id="catalogo-motivo" rows={3} className={inputClass} value={catalogForm.justification} onChange={event => updateCatalog('justification', event.target.value)} required />
                </Field>
                <Field id="catalogo-fuente" label="Fuente normativa o técnica">
                  <input id="catalogo-fuente" className={inputClass} value={catalogForm.sourceReference} onChange={event => updateCatalog('sourceReference', event.target.value)} required />
                </Field>
                <div>
                  <Button type="submit" disabled={saving}>{saving ? 'Enviando…' : 'Enviar solicitud'}</Button>
                </div>
              </form>
            )}

            <div className="grid gap-3">
              {requests.map(request => (
                <article key={request.id} className="grid gap-3 rounded-xl border border-line bg-surface p-4 md:grid-cols-2">
                  <div className="grid gap-1">
                    <Badge status={request.status} />
                    <h3 className="text-base font-bold text-ink-strong">{request.code} · {typeLabel[request.type]}</h3>
                    <p className="text-sm text-muted">{request.description || 'Sin nueva descripción'}</p>
                  </div>
                  <div className="grid content-start gap-1 text-sm">
                    <p className="text-ink">{request.justification}</p>
                    <small className="text-xs text-muted">{request.sourceReference} · {request.createdBy}</small>
                  </div>
                  {user.role === 'admin' && request.status === 'pending' && (
                    <footer className="flex flex-wrap justify-end gap-2 md:col-span-2">
                      <Button variant="secondary" size="sm" disabled={saving} onClick={() => reviewRequest(request.id, 'rejected')}>Rechazar</Button>
                      <Button size="sm" disabled={saving} onClick={() => reviewRequest(request.id, 'approved')}>Aprobar y aplicar</Button>
                    </footer>
                  )}
                </article>
              ))}
            </div>
            {!requests.length && <p className="py-6 text-center text-sm text-muted">No hay solicitudes de cambio.</p>}
          </Panel>
        </>
      )}
    </div>
  );
}
