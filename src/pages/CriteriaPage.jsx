import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/epen/PageHeader';
import PanelHeading from '../components/epen/PanelHeading';
import {
  createCatalogChangeRequestReal, createCodingRuleReal, listCatalogChangeRequestsReal,
  listCodingRulesReal, reviewCatalogChangeRequestReal, searchCatalogReal,
  updateCodingRuleReal, updateCodingRuleStatusReal,
} from '../services/dataClient';
import { useAuth } from '../state/AuthContext';

const emptyRule = { code: '', title: '', pattern: '', occupationalContext: '', guidance: '', positiveExamples: '', negativeExamples: '', sourceReference: '' };
const emptyCatalogRequest = { type: 'add', code: '', description: '', justification: '', sourceReference: '' };
const statusLabel = { draft: 'Borrador', pending: 'Pendiente', active: 'Vigente', retired: 'Retirado', approved: 'Aprobada', rejected: 'Rechazada' };
const typeLabel = { add: 'Nuevo código', update: 'Actualizar descripción', deactivate: 'Desactivar código' };

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

  async function submitRule(event) {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      const payload = { ...form, positiveExamples: form.positiveExamples.split('\n'), negativeExamples: form.negativeExamples.split('\n') };
      if (editingId) await updateCodingRuleReal(editingId, payload); else await createCodingRuleReal(payload);
      setForm(emptyRule); setCatalogQuery(''); setEditingId(null); setShowRuleForm(false);
      await loadRules(); setMessage(editingId ? 'Criterio actualizado.' : 'Criterio guardado como borrador.');
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }

  async function submitCatalogRequest(event) {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      await createCatalogChangeRequestReal(catalogForm);
      setCatalogForm(emptyCatalogRequest); setShowCatalogForm(false); await loadRequests();
      setMessage('Solicitud enviada para revisión administrativa.');
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }

  function editRule(rule) {
    setEditingId(rule.id); setShowRuleForm(true); setTab('rules');
    setForm({ code: rule.code, title: rule.title, pattern: rule.pattern, occupationalContext: rule.occupationalContext || '', guidance: rule.guidance, positiveExamples: (rule.positiveExamples || []).join('\n'), negativeExamples: (rule.negativeExamples || []).join('\n'), sourceReference: rule.sourceReference || '' });
    setCatalogQuery(`${rule.code} · ${rule.codeDescription}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function changeRuleStatus(id, next) {
    setSaving(true); setMessage('');
    try { await updateCodingRuleStatusReal(id, next); await loadRules(); setMessage(`Criterio actualizado: ${statusLabel[next]}.`); }
    catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }

  async function reviewRequest(id, next) {
    if (!window.confirm(next === 'approved' ? '¿Aplicar este cambio al catálogo activo?' : '¿Rechazar esta solicitud?')) return;
    setSaving(true); setMessage('');
    try {
      await reviewCatalogChangeRequestReal(id, next, next === 'rejected' ? 'Solicitud rechazada durante la revisión administrativa.' : '');
      await loadRequests(); setMessage(next === 'approved' ? 'Cambio aplicado al catálogo.' : 'Solicitud rechazada.');
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }

  return <div className="page criteria-page">
    <PageHeader icon="journal-check" title="Catálogo y criterios" description="Gobierna códigos y reglas sin alterar silenciosamente decisiones anteriores." />
    <div className="section-tabs" role="tablist" aria-label="Gobierno de clasificación">
      <button role="tab" aria-selected={tab === 'rules'} onClick={() => setTab('rules')}>Criterios de decisión</button>
      <button role="tab" aria-selected={tab === 'catalog'} onClick={() => setTab('catalog')}>Cambios al catálogo</button>
    </div>
    {message && <div className={`notice ${/guardado|actualizado|enviada|aplicado/i.test(message) ? 'notice--success' : 'notice--error'}`} role="status">{message}</div>}

    {tab === 'rules' && <>
      <section className="governance-summary" aria-label="Efecto de los criterios">
        <strong>Un criterio vigente guía la revisión.</strong>
        <span>No reclasifica bases anteriores ni reentrena el modelo. Sus ejemplos deben incorporarse a un conjunto validado antes de entrenar una nueva versión.</span>
      </section>
      <section className="panel governance-list">
        <PanelHeading title="Criterios registrados" description={`${rules.length} resultado${rules.length === 1 ? '' : 's'}`} actions={<div className="governance-actions">{canEdit && <button className="button button--primary" type="button" onClick={() => { setEditingId(null); setForm(emptyRule); setCatalogQuery(''); setShowRuleForm(value => !value); }}>{showRuleForm ? 'Cerrar formulario' : 'Crear criterio'}</button>}<label>Estado<select value={status} onChange={event => setStatus(event.target.value)}><option value="">Todos</option><option value="draft">Borradores</option><option value="pending">Pendientes</option><option value="active">Vigentes</option><option value="retired">Retirados</option></select></label></div>} />
        {showRuleForm && canEdit && <form className="criteria-form governance-form" onSubmit={submitRule}>
          <h3>{editingId ? `Editar criterio #${editingId}` : 'Nuevo criterio'}</h3>
          <div className="criteria-catalog"><label>Vincular código CIIU<input type="search" value={catalogQuery} onChange={event => setCatalogQuery(event.target.value)} placeholder="Escribe código o actividad" required={!form.code} /></label>{catalog.length > 0 && <div className="criteria-catalog-results">{catalog.map(item => <button className={form.code === item.codigo ? 'is-selected' : ''} type="button" key={item.codigo} onClick={() => { update('code', item.codigo); setCatalogQuery(`${item.codigo} · ${item.descripcion}`); setCatalog([]); }}><strong>{item.codigo}</strong><span>{item.descripcion}</span></button>)}</div>}<small>{form.code ? `${form.code} · ${selectedDescription || catalogQuery.split('·').slice(1).join('·').trim()}` : 'Selecciona un código del catálogo activo.'}</small></div>
          <label>Título<input maxLength={160} value={form.title} onChange={event => update('title', event.target.value)} required /></label>
          <label>Cuándo se aplica<textarea rows={2} value={form.pattern} onChange={event => update('pattern', event.target.value)} required /></label>
          <label>Criterio de decisión<textarea rows={3} value={form.guidance} onChange={event => update('guidance', event.target.value)} required /></label>
          <details className="form-disclosure"><summary>Contexto, ejemplos y fuente</summary><div><label>Contexto ocupacional<textarea rows={2} value={form.occupationalContext} onChange={event => update('occupationalContext', event.target.value)} /></label><label>Ejemplos válidos, uno por línea<textarea rows={3} value={form.positiveExamples} onChange={event => update('positiveExamples', event.target.value)} /></label><label>Contraejemplos, uno por línea<textarea rows={3} value={form.negativeExamples} onChange={event => update('negativeExamples', event.target.value)} /></label><label>Fuente o referencia<input value={form.sourceReference} onChange={event => update('sourceReference', event.target.value)} /></label></div></details>
          <div className="form-actions"><button className="button button--primary" disabled={saving || !form.code}>{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Guardar borrador'}</button>{editingId && <button type="button" className="button button--secondary" onClick={() => { setEditingId(null); setForm(emptyRule); setShowRuleForm(false); }}>Cancelar</button>}</div>
        </form>}
        <div className="criteria-list">{rules.map(rule => { const canManageOwn = user.role === 'admin' || Number(rule.createdById) === Number(user.id); return <article key={rule.id}><header><div><span className={`rule-status rule-status--${rule.status}`}>{statusLabel[rule.status]}</span><h3>{rule.code} · {rule.title}</h3><p>{rule.codeDescription}</p></div><span>#{rule.id}</span></header><div className="criteria-rule-copy"><strong>{rule.pattern}</strong><p>{rule.guidance}</p></div><footer><span>{rule.createdBy}{rule.approvedBy ? ` · aprobó ${rule.approvedBy}` : ''}</span><div>{canEdit && canManageOwn && rule.status === 'draft' && <button className="button button--quiet" disabled={saving} onClick={() => editRule(rule)}>Editar</button>}{canEdit && canManageOwn && rule.status === 'draft' && <button className="button button--secondary" disabled={saving} onClick={() => changeRuleStatus(rule.id, 'pending')}>Enviar</button>}{user.role === 'admin' && rule.status === 'pending' && <button className="button button--primary" disabled={saving} onClick={() => changeRuleStatus(rule.id, 'active')}>Aprobar</button>}{user.role === 'admin' && rule.status === 'active' && <button className="button button--danger-quiet" disabled={saving} onClick={() => changeRuleStatus(rule.id, 'retired')}>Retirar</button>}</div></footer></article>; })}</div>
        {!rules.length && <p className="empty-state">No hay criterios con este estado.</p>}
      </section>
    </>}

    {tab === 'catalog' && <>
      <section className="catalog-impact" aria-label="Impacto de un cambio de catálogo"><div><strong>Disponible de inmediato</strong><span>Selección manual y nuevos criterios.</span></div><div><strong>Requiere una nueva versión</strong><span>Reentrenar el clasificador y sincronizar el catálogo de la asistencia.</span></div><div><strong>No es retroactivo</strong><span>Las bases anteriores conservan su trazabilidad.</span></div></section>
      <section className="panel governance-list">
        <PanelHeading title="Solicitudes de catálogo" description="Solo un administrador puede aplicar un cambio." actions={canEdit && <button className="button button--primary" type="button" onClick={() => setShowCatalogForm(value => !value)}>{showCatalogForm ? 'Cerrar formulario' : 'Solicitar cambio'}</button>} />
        {showCatalogForm && canEdit && <form className="catalog-request-form governance-form" onSubmit={submitCatalogRequest}>
          <h3>Propuesta documentada</h3>
          <label>Tipo de cambio<select value={catalogForm.type} onChange={event => updateCatalog('type', event.target.value)}><option value="add">Agregar código</option><option value="update">Actualizar descripción</option><option value="deactivate">Desactivar código</option></select></label>
          <label>Código de cuatro dígitos<input inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={catalogForm.code} onChange={event => updateCatalog('code', event.target.value.replace(/\D/g, '').slice(0, 4))} required /></label>
          {catalogForm.type !== 'deactivate' && <label>Descripción oficial<textarea rows={2} value={catalogForm.description} onChange={event => updateCatalog('description', event.target.value)} required /></label>}
          <label>Motivo del cambio<textarea rows={3} value={catalogForm.justification} onChange={event => updateCatalog('justification', event.target.value)} required /></label>
          <label>Fuente normativa o técnica<input value={catalogForm.sourceReference} onChange={event => updateCatalog('sourceReference', event.target.value)} required /></label>
          <button className="button button--primary" disabled={saving}>{saving ? 'Enviando…' : 'Enviar solicitud'}</button>
        </form>}
        <div className="catalog-request-list">{requests.map(request => <article key={request.id}><div><span className={`rule-status rule-status--${request.status}`}>{statusLabel[request.status]}</span><h3>{request.code} · {typeLabel[request.type]}</h3><p>{request.description || 'Sin nueva descripción'}</p></div><div><p>{request.justification}</p><small>{request.sourceReference} · {request.createdBy}</small></div>{user.role === 'admin' && request.status === 'pending' && <footer><button className="button button--secondary" disabled={saving} onClick={() => reviewRequest(request.id, 'rejected')}>Rechazar</button><button className="button button--primary" disabled={saving} onClick={() => reviewRequest(request.id, 'approved')}>Aprobar y aplicar</button></footer>}</article>)}</div>
        {!requests.length && <p className="empty-state">No hay solicitudes de cambio.</p>}
      </section>
    </>}
  </div>;
}
