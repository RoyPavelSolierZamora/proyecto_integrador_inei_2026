import { useEffect, useMemo, useState } from 'react';
import { createCodingRuleReal, listCodingRulesReal, searchCatalogReal, updateCodingRuleReal, updateCodingRuleStatusReal } from '../services/dataClient';
import { useAuth } from '../state/AuthContext';

const statusLabel = { draft: 'Borrador', pending: 'Pendiente de aprobación', active: 'Vigente', retired: 'Retirado' };

export default function CriteriaPage() {
  const { user } = useAuth();
  const [rules, setRules] = useState([]);
  const [status, setStatus] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalog, setCatalog] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ code: '', title: '', pattern: '', occupationalContext: '', guidance: '', positiveExamples: '', negativeExamples: '', sourceReference: '' });
  const canEdit = ['supervisor', 'admin'].includes(user.role);

  async function load() {
    const result = await listCodingRulesReal(status);
    setRules(result.rules || []);
  }
  useEffect(() => { load().catch(error => setMessage(error.message)); }, [status]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => searchCatalogReal(catalogQuery).then(rows => { if (active) setCatalog(rows.slice(0, 8)); }).catch(() => setCatalog([])), 180);
    return () => { active = false; clearTimeout(timer); };
  }, [catalogQuery]);

  const selectedDescription = useMemo(() => catalog.find(item => item.codigo === form.code)?.descripcion || '', [catalog, form.code]);
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));

  async function submit(event) {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      const payload = { ...form, positiveExamples: form.positiveExamples.split('\n'), negativeExamples: form.negativeExamples.split('\n') };
      if (editingId) await updateCodingRuleReal(editingId, payload); else await createCodingRuleReal(payload);
      setForm({ code: '', title: '', pattern: '', occupationalContext: '', guidance: '', positiveExamples: '', negativeExamples: '', sourceReference: '' }); setCatalogQuery('');
      setEditingId(null); await load(); setMessage(editingId ? 'Borrador actualizado.' : 'Criterio guardado como borrador.');
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }

  function editRule(rule) {
    setEditingId(rule.id);
    setForm({ code: rule.code, title: rule.title, pattern: rule.pattern, occupationalContext: rule.occupationalContext || '', guidance: rule.guidance, positiveExamples: (rule.positiveExamples || []).join('\n'), negativeExamples: (rule.negativeExamples || []).join('\n'), sourceReference: rule.sourceReference || '' });
    setCatalogQuery(`${rule.code} · ${rule.codeDescription}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingId(null); setCatalogQuery('');
    setForm({ code: '', title: '', pattern: '', occupationalContext: '', guidance: '', positiveExamples: '', negativeExamples: '', sourceReference: '' });
  }

  async function changeStatus(id, next) {
    setSaving(true); setMessage('');
    try { await updateCodingRuleStatusReal(id, next); await load(); setMessage(`Criterio actualizado: ${statusLabel[next]}.`); }
    catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }

  return <div className="page criteria-page">
    <div className="page-heading"><div><p className="eyebrow">Conocimiento gobernado</p><h1>Criterios de codificación</h1><p>Registra ejemplos y excepciones sin alterar el catálogo oficial CIIU. Solo los criterios aprobados pueden considerarse vigentes.</p></div></div>
    {message && <div className={`notice ${/guardado|actualizado/i.test(message) ? 'notice--success' : 'notice--error'}`} role="status">{message}</div>}
    {canEdit && <section className="panel criteria-editor"><div className="panel-heading"><div><p className="eyebrow">{editingId ? 'Edición controlada' : 'Nuevo criterio'}</p><h2>{editingId ? `Editar borrador #${editingId}` : 'Crear borrador'}</h2><p>El código debe existir en el catálogo activo. Los ejemplos no sustituyen una aprobación.</p></div>{editingId && <button type="button" className="button button--quiet" onClick={cancelEdit}>Cancelar edición</button>}</div><form className="criteria-form" onSubmit={submit}>
      <div className="criteria-catalog"><label>Buscar código CIIU<input type="search" value={catalogQuery} onChange={event => setCatalogQuery(event.target.value)} placeholder="Código o descripción" /></label><div className="criteria-catalog-results">{catalog.map(item => <button className={form.code === item.codigo ? 'is-selected' : ''} type="button" key={item.codigo} onClick={() => { update('code', item.codigo); setCatalogQuery(`${item.codigo} · ${item.descripcion}`); }}><strong>{item.codigo}</strong><span>{item.descripcion}</span></button>)}</div><small>{form.code ? `Seleccionado: ${form.code} · ${selectedDescription || catalogQuery.split('·').slice(1).join('·').trim()}` : 'Selecciona un código oficial.'}</small></div>
      <label>Título<input maxLength={160} value={form.title} onChange={event => update('title', event.target.value)} required /></label>
      <label>Patrón o actividad observada<textarea rows={3} value={form.pattern} onChange={event => update('pattern', event.target.value)} required /></label>
      <label>Contexto ocupacional<textarea rows={2} value={form.occupationalContext} onChange={event => update('occupationalContext', event.target.value)} /></label>
      <label>Criterio de aplicación<textarea rows={4} value={form.guidance} onChange={event => update('guidance', event.target.value)} required /></label>
      <label>Ejemplos válidos, uno por línea<textarea rows={3} value={form.positiveExamples} onChange={event => update('positiveExamples', event.target.value)} /></label>
      <label>Contraejemplos, uno por línea<textarea rows={3} value={form.negativeExamples} onChange={event => update('negativeExamples', event.target.value)} /></label>
      <label>Fuente o referencia<input value={form.sourceReference} onChange={event => update('sourceReference', event.target.value)} /></label>
      <button className="button button--primary" disabled={saving || !form.code}>{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Guardar borrador'}</button>
    </form></section>}
    <section className="panel criteria-inbox"><div className="panel-heading"><div><p className="eyebrow">Bandeja de criterios</p><h2>Versiones registradas</h2></div><label>Estado<select value={status} onChange={event => setStatus(event.target.value)}><option value="">Todos</option><option value="draft">Borradores</option><option value="pending">Pendientes</option><option value="active">Vigentes</option><option value="retired">Retirados</option></select></label></div>
      <div className="criteria-list">{rules.map(rule => { const canManageOwn = user.role === 'admin' || Number(rule.createdById) === Number(user.id); return <article key={rule.id}><div className="criteria-card-heading"><div><span className={`rule-status rule-status--${rule.status}`}>{statusLabel[rule.status]}</span><h3>{rule.code} · {rule.title}</h3><small>{rule.codeDescription}</small></div><span>#{rule.id}</span></div><p><strong>Cuándo aplicarlo:</strong> {rule.pattern}</p><p>{rule.guidance}</p><footer><span>Creado por {rule.createdBy}{rule.approvedBy ? ` · Aprobado por ${rule.approvedBy}` : ''}</span><div>{canEdit && canManageOwn && rule.status === 'draft' && <button className="button button--quiet" disabled={saving} onClick={() => editRule(rule)}>Editar</button>}{canEdit && canManageOwn && rule.status === 'draft' && <button className="button button--secondary" disabled={saving} onClick={() => changeStatus(rule.id, 'pending')}>Enviar a aprobación</button>}{canEdit && canManageOwn && rule.status === 'pending' && <button className="button button--quiet" disabled={saving} onClick={() => changeStatus(rule.id, 'draft')}>Devolver a borrador</button>}{user.role === 'admin' && rule.status === 'pending' && <button className="button button--primary" disabled={saving} onClick={() => changeStatus(rule.id, 'active')}>Aprobar</button>}{user.role === 'admin' && rule.status === 'active' && <button className="button button--danger-quiet" disabled={saving} onClick={() => changeStatus(rule.id, 'retired')}>Retirar</button>}</div></footer></article>; })}</div>
      {!rules.length && <p className="empty-state">No hay criterios con este estado.</p>}
    </section>
  </div>;
}
