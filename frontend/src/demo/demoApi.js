// Modo demostración (GitHub Pages). Simula la API con datos sintéticos guardados en memoria del
// navegador: no hay servidor, base de datos ni datos reales. Solo se activa en el build con
// VITE_DEMO=true (ver scripts/build-demo.mjs). Los cambios se pierden al recargar la página.
import fixtures from './fixtures.json';

// Usuarios de demostración. Cualquier contraseña sirve.
const USUARIOS = [
  { id: 1, username: 'admin', name: 'Administrador demo', role: 'admin', active: true },
  { id: 11, username: 'ana', name: 'Ana Quispe', role: 'analista', active: true, analyst_code: 'ANALISTA001' },
  { id: 12, username: 'luis', name: 'Luis Huamán', role: 'analista', active: true, analyst_code: 'ANALISTA002' },
  { id: 13, username: 'rosa', name: 'Rosa Díaz', role: 'analista', active: true, analyst_code: 'ANALISTA003' },
  { id: 14, username: 'supervisor', name: 'Supervisora demo', role: 'supervisor', active: true },
];

const ETIQUETA_FUENTE = { ml: 'Clasificador automático', llm: 'Asistente de IA', review: 'Revisión manual', todas: 'Todas' };
const hoy = () => new Date().toISOString();

const estado = {
  datasets: structuredClone(fixtures.datasets),
  cases: structuredClone(fixtures.cases),
  catalog: fixtures.catalog,
  lots: [],
  repartos: [],
  nextLot: 1,
  nextReparto: 1,
  session: null,
};

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const fuenteDe = c => {
  if (c.estado === 'revision') return 'review';
  if (c.origen_decision === 'qwen') return 'llm';
  return 'ml';
};

const datasetPorId = id => estado.datasets.find(d => d.id === Number(id)) || null;
const casosDe = datasetId => estado.cases.filter(c => c.dataset_id === Number(datasetId));
const casoPorId = (datasetId, valor) => estado.cases.find(c => c.dataset_id === Number(datasetId)
  && (String(c.id) === String(valor) || c.id_registro === valor));

// Indicadores con la misma forma que workspaceIndicators(); en la demo no hay referencia humana.
function indicadores(datasetId) {
  const casos = casosDe(datasetId);
  const procesados = casos.filter(c => c.candidatos?.length).length;
  const automaticos = casos.filter(c => c.origen_decision === 'r2' && c.estado === 'confirmado').length;
  const vacio = { evaluated: 0, accuracy: null, macroF1: null };
  return {
    global: { ...vacio, total: casos.length, withReference: 0, withoutReference: casos.length, withoutPrediction: 0, coverage: null },
    r2: { ...vacio, automaticApproval: procesados ? automaticos / procesados : null, threshold: 0.9 },
    r3: { ...vacio, automaticApproval: null },
    reference: { hasActiveReference: false, matched: 0 },
  };
}

// Clave de la vista de datos: los casos de la base que la persona puede ver (sin restricción de lotes en la demo).
function casosVisibles(datasetId, usuario) {
  const todos = casosDe(datasetId);
  if (usuario?.role !== 'analista') return todos;
  const mios = new Set(estado.lots.filter(l => l.assigneeId === usuario.id && l.active && l.dataset_id === Number(datasetId))
    .flatMap(l => l.casos));
  return todos.filter(c => mios.has(c.id));
}

// ----- calidad de codificación ------------------------------------------------------

function pendientesDe(datasetId, fuente) {
  return estado.cases.filter(c => c.dataset_id === Number(datasetId)
    && !c.lot && (c.estado === 'pendiente' || c.estado === 'revision')
    && (fuente === 'todas' || fuenteDe(c) === fuente));
}

function basesCalidad() {
  return estado.datasets.map(d => {
    const casos = casosDe(d.id);
    const pendientes = casos.filter(c => !c.lot && (c.estado === 'pendiente' || c.estado === 'revision'));
    return {
      id: d.id,
      name: d.name,
      period: d.period,
      version: d.version,
      active: d.status === 'active',
      records: casos.length,
      pending: {
        ml: pendientes.filter(c => fuenteDe(c) === 'ml').length,
        llm: pendientes.filter(c => fuenteDe(c) === 'llm').length,
        review: pendientes.filter(c => fuenteDe(c) === 'review').length,
      },
      assigned: casos.filter(c => c.lot).length,
    };
  });
}

function loteResumen(lote) {
  const base = datasetPorId(lote.dataset_id);
  const persona = USUARIOS.find(u => u.id === lote.assigneeId);
  const decididos = lote.casos.map(id => estado.cases.find(c => c.id === id))
    .filter(c => c.decidedBy === lote.assigneeId);
  const asignados = lote.casos.length;
  const decidido = decididos.length;
  const diario = {};
  for (const c of decididos) {
    const dia = (c.decidedAt || hoy()).slice(0, 10);
    diario[dia] = (diario[dia] || 0) + 1;
  }
  return {
    lot: lote.id,
    base: lote.dataset_id,
    baseName: base?.name || '',
    period: base?.period || '',
    fuente: lote.fuente,
    fuenteLabel: ETIQUETA_FUENTE[lote.fuente],
    active: lote.active,
    repartoId: lote.repartoId,
    repartoName: lote.repartoName || 'Reparto anterior',
    repartoCreatedAt: lote.repartoCreatedAt || null,
    daily: Object.entries(diario).map(([day, count]) => ({ day, count })),
    assigneeId: lote.assigneeId,
    name: persona?.name || 'Sin asignar',
    code: persona?.analyst_code || persona?.username || 'Sin asignar',
    assigned: asignados,
    decided: decidido,
    remaining: asignados - decidido,
    percent: asignados ? Math.round((decidido / asignados) * 1000) / 10 : 0,
    verified: 0,
    correct: 0,
    incorrect: 0,
    uncertain: 0,
    accuracy: null,
    interval: null,
  };
}

function resumenCalidad(baseId) {
  const lotes = estado.lots.filter(l => !baseId || l.dataset_id === Number(baseId)).map(loteResumen);
  const personas = new Map();
  for (const l of lotes) {
    if (l.assigneeId === null) continue;
    const e = personas.get(l.assigneeId) || { assigneeId: l.assigneeId, name: l.name, code: l.code, assigned: 0, decided: 0 };
    e.assigned += l.assigned;
    e.decided += l.decided;
    personas.set(l.assigneeId, e);
  }
  const daily = {};
  for (const l of lotes) for (const d of l.daily) daily[d.day] = (daily[d.day] || 0) + d.count;
  const asignados = lotes.reduce((s, l) => s + l.assigned, 0);
  const decididos = lotes.reduce((s, l) => s + l.decided, 0);
  return {
    lots: lotes,
    people: [...personas.values()].map(p => ({
      ...p,
      remaining: p.assigned - p.decided,
      percent: p.assigned ? Math.round((p.decided / p.assigned) * 1000) / 10 : 0,
      verified: 0, correct: 0, incorrect: 0, accuracy: null, interval: null,
    })),
    daily: Object.entries(daily).sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, count]) => ({ day, count })),
    totals: {
      assigned: asignados,
      decided: decididos,
      remaining: asignados - decididos,
      percent: asignados ? Math.round((decididos / asignados) * 1000) / 10 : 0,
      verified: 0,
      accuracy: null,
      interval: null,
    },
  };
}

function crearReparto(items, nombre) {
  const id = estado.nextReparto;
  estado.nextReparto += 1;
  const creado = hoy();
  const lines = [];
  for (const item of items) {
    const pool = pendientesDe(item.base, item.fuente);
    const cantidad = Math.min(pool.length, Math.round(pool.length * ((item.porcentaje ?? 100) / 100)));
    const elegidos = pool.slice(0, cantidad);
    const lote = {
      id: estado.nextLot,
      dataset_id: Number(item.base),
      fuente: item.fuente,
      assigneeId: item.codificador ?? null,
      active: true,
      repartoId: id,
      repartoName: nombre,
      repartoCreatedAt: creado,
      casos: elegidos.map(c => c.id),
    };
    estado.nextLot += 1;
    for (const c of elegidos) c.lot = lote.id;
    estado.lots.push(lote);
    lines.push({ lot: lote.id, base: lote.dataset_id, fuente: lote.fuente, codificador: lote.assigneeId, casos: elegidos.length });
  }
  estado.repartos.push({ id, name: nombre });
  return { reparto: id, name: nombre, lots: lines };
}

// Un reparto de ejemplo para que la pantalla no empiece vacía.
function sembrarEjemplo() {
  const pool = pendientesDe(2, 'todas');
  if (pool.length < 6) return;
  const reparto = crearReparto([
    { base: 2, fuente: 'todas', codificador: 11, porcentaje: 50 },
    { base: 2, fuente: 'todas', codificador: 12, porcentaje: 34 },
    { base: 2, fuente: 'todas', codificador: 13, porcentaje: null },
  ], 'Lote de revisión · demostración');
  const lotes = estado.lots.filter(l => l.repartoId === reparto.reparto);
  const marcar = (lote, indices, persona) => {
    for (const i of indices) {
      const c = estado.cases.find(x => x.id === lote.casos[i]);
      if (!c) continue;
      c.estado = 'confirmado';
      c.codigo_final = c.candidatos[0]?.codigo || null;
      c.origen_decision = 'humano';
      c.decidedBy = persona;
      c.decidedAt = hoy();
      c.responsable_decision = USUARIOS.find(u => u.id === persona)?.name || null;
      c.tipo_decision = 'confirmacion';
    }
  };
  marcar(lotes[0], [0, 1, 2], 11);
  marcar(lotes[2], [0], 13);
}

// Resumen de métricas con la forma que lee la página de Métricas. Todo sale de los casos sintéticos.
function resumenMetricas(datasetId) {
  const casos = casosDe(datasetId);
  const total = casos.length || 1;
  const resueltos = casos.filter(c => c.estado === 'confirmado' || c.estado === 'corregido');
  const revision = casos.filter(c => c.estado === 'revision');
  const automaticos = casos.filter(c => c.origen_decision === 'r2' && c.estado === 'confirmado');
  const banda = { high: 0, medium: 0, low: 0, missing: 0 };
  for (const c of casos) {
    const v = c.confianza_ml;
    if (v == null || Number.isNaN(v)) banda.missing += 1;
    else if (v >= 0.8) banda.high += 1;
    else if (v >= 0.5) banda.medium += 1;
    else banda.low += 1;
  }
  const conteo = {};
  for (const c of casos) {
    const codigo = c.codigo_final || c.candidatos[0]?.codigo;
    if (codigo) conteo[codigo] = (conteo[codigo] || 0) + 1;
  }
  const topCodes = Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([codigo, count]) => ({
    codigo,
    descripcion: estado.catalog.find(k => k.codigo === codigo)?.descripcion || '',
    count,
  }));
  const top5 = topCodes.slice(0, 5).reduce((s, r) => s + r.count, 0);
  const conTexto = casos.filter(c => c.p309).length;
  const dataset = datasetPorId(datasetId);
  return {
    dataset,
    totals: {
      total: casos.length,
      review: revision.length,
      resolved: resueltos.length,
      automatic: automaticos.length,
      pending: casos.length - resueltos.length,
      confidenceBands: banda,
    },
    topCodes,
    rates: {
      review: revision.length / total,
      automatic: automaticos.length / total,
      resolved: resueltos.length / total,
      completeness: conTexto / total,
      topFiveConcentration: top5 / total,
    },
    indicators: indicadores(datasetId),
  };
}

// ----- rutas --------------------------------------------------------------------

function sesion() {
  return estado.session;
}

function responder(method, path, params, body) {
  const partes = path.split('/').filter(Boolean);

  if (path === '/api/auth/login' && method === 'POST') {
    const usuario = USUARIOS.find(u => u.username === String(body?.username || '').trim());
    if (!usuario) return json({ error: 'Usuario o contraseña incorrectos.' }, 401);
    estado.session = usuario;
    return json({ user: usuario, csrfToken: 'demo' });
  }
  if (path === '/api/auth/logout' && method === 'POST') {
    estado.session = null;
    return json({ ok: true });
  }
  if (path === '/api/auth/me') {
    if (!sesion()) return json({ error: 'No autenticado.' }, 401);
    return json({ user: sesion(), csrfToken: 'demo' });
  }
  if (!sesion()) return json({ error: 'Inicia sesión para continuar.' }, 401);
  const usuario = sesion();

  if (path === '/api/data/bootstrap') {
    const activa = estado.datasets.find(d => d.active) || null;
    return json({
      datasets: estado.datasets,
      activeDataset: activa,
      cases: activa ? casosVisibles(activa.id, usuario) : [],
      events: [],
      indicators: activa ? indicadores(activa.id) : null,
    });
  }
  if (partes[0] === 'api' && partes[1] === 'datasets' && partes[2]) {
    const datasetId = partes[2];
    const dataset = datasetPorId(datasetId);
    if (partes[3] === 'workspace') {
      if (!dataset) return json({ error: 'Base no encontrada.' }, 404);
      return json({ dataset, cases: casosVisibles(datasetId, usuario), events: [], indicators: indicadores(datasetId) });
    }
    if (partes[3] === 'history') {
      return json({ dataset, events: [], total: 0, limit: 30, offset: 0 });
    }
    if (partes[3] === 'cases' && partes[5] === 'decision' && method === 'POST') {
      const caso = casoPorId(datasetId, partes[4]);
      if (!caso) return json({ error: 'Caso no encontrado.' }, 404);
      const accion = body?.action;
      const codigo = body?.code || caso.candidatos[0]?.codigo || null;
      caso.estado = accion === 'correction' ? 'corregido' : accion === 'review' ? 'revision' : 'confirmado';
      caso.codigo_final = caso.estado === 'revision' ? null : codigo;
      caso.origen_decision = 'humano';
      caso.responsable_decision = usuario.name;
      caso.tipo_decision = accion;
      caso.justificacion_decision = body?.justification || null;
      caso.decidedBy = usuario.id;
      caso.decidedAt = hoy();
      return json({ case: caso });
    }
    if (partes[3] === 'cases' && partes[5] === 'qwen' && method === 'POST') {
      const caso = casoPorId(datasetId, partes[4]);
      if (!caso) return json({ error: 'Caso no encontrado.' }, 404);
      const codigo = caso.candidatos[0]?.codigo || null;
      caso.qwen = { decision: 'seleccionar', codigo, justificacion: 'Respuesta simulada de la demostración.', latencia_s: 1.1 };
      return json({ result: caso.qwen, case: caso });
    }
  }

  if (path === '/api/catalog') {
    const q = String(params.get('q') || '').toLowerCase();
    const limite = Number(params.get('limit') || 0);
    const desplazamiento = Number(params.get('offset') || 0);
    const filtradas = estado.catalog.filter(c => !q || c.codigo.includes(q) || c.descripcion.toLowerCase().includes(q));
    const rows = limite ? filtradas.slice(desplazamiento, desplazamiento + limite) : filtradas;
    return json({ rows, total: filtradas.length });
  }

  if (path === '/api/system/r3-health' || path === '/api/system/r2-health') {
    return json({ ok: true, status: 'demo', mode: 'demostración', message: 'Modo demostración: sin servicios locales.' });
  }
  if (path === '/api/r2/jobs') return json({ jobs: [] });
  if (path === '/api/admin/users') return json({ users: USUARIOS.map(u => ({ ...u, createdAt: '2026-11-01T00:00:00Z' })) });
  if (path === '/api/coding-rules') return json({ rules: [] });
  if (path === '/api/catalog-change-requests') return json({ requests: [] });
  if (path === '/api/reference-datasets') return json({ references: [] });

  if (path === '/api/mis-lotes' && method === 'GET') {
    const lotes = estado.lots.filter(l => l.assigneeId === usuario.id && l.active).map(loteResumen);
    return json({ lots: lotes.map(l => ({
      lot: l.lot, base: l.base, baseName: l.baseName, period: l.period, fuente: l.fuente, fuenteLabel: l.fuenteLabel,
      assigned: l.assigned, decided: l.decided, remaining: l.remaining, percent: l.percent, createdAt: l.repartoCreatedAt,
    })), pending: lotes.filter(l => l.remaining > 0).length });
  }
  if (partes[0] === 'api' && partes[1] === 'mis-lotes' && partes[2] && partes[3] === 'casos') {
    const lote = estado.lots.find(l => String(l.id) === partes[2]);
    if (!lote) return json({ error: 'Lote no encontrado.' }, 404);
    if (usuario.role === 'analista' && lote.assigneeId !== usuario.id) return json({ error: 'Este lote no está asignado a tu usuario.' }, 403);
    const base = datasetPorId(lote.dataset_id);
    return json({
      lot: { id: lote.id, datasetId: lote.dataset_id, datasetName: base?.name, period: base?.period, fuente: lote.fuente, fuenteLabel: ETIQUETA_FUENTE[lote.fuente] },
      cases: lote.casos.map(id => estado.cases.find(c => c.id === id)).map(c => ({
        id: c.id_registro,
        p309: c.p309,
        p308: c.p308,
        sugerido: lote.fuente === 'review' ? null : (c.candidatos[0]?.codigo || null),
        decidido: c.decidedBy === lote.assigneeId,
      })),
    });
  }

  if (path === '/api/calidad-codificacion/usuarios') {
    return json({ users: USUARIOS.filter(u => u.role === 'analista').map(u => ({ id: u.id, name: u.name, code: u.analyst_code })) });
  }
  if (path === '/api/calidad-codificacion/bases') return json({ bases: basesCalidad() });
  if (path === '/api/calidad-codificacion/resumen') {
    return json(resumenCalidad(params.get('base')));
  }
  if (path === '/api/calidad-codificacion/previsualizar' && method === 'POST') {
    const items = body?.asignaciones || [];
    const lineas = items.map(item => {
      const pool = pendientesDe(item.base, item.fuente);
      return {
        base: item.base,
        fuente: item.fuente,
        fuenteLabel: ETIQUETA_FUENTE[item.fuente],
        codificador: item.codificador ?? null,
        porcentaje: item.porcentaje ?? null,
        casos: Math.min(pool.length, Math.round(pool.length * ((item.porcentaje ?? 100) / 100))),
      };
    });
    return json({ valid: true, errors: [], warnings: [], lines: lineas, sinAsignar: 0 });
  }
  if (path === '/api/calidad-codificacion/reparto' && method === 'POST') {
    return json(crearReparto(body?.asignaciones || [], String(body?.nombre || '').trim() || 'Reparto demostración'), 201);
  }
  if (partes[0] === 'api' && partes[1] === 'calidad-codificacion') {
    if (partes[2] === 'lotes' && partes[3] && partes[4] === 'codificador' && method === 'PATCH') {
      const lote = estado.lots.find(l => String(l.id) === partes[3]);
      if (!lote) return json({ error: 'Lote no encontrado.' }, 404);
      if (lote.casos.some(id => estado.cases.find(c => c.id === id)?.decidedBy)) {
        return json({ error: 'Este lote ya tiene decisiones humanas. No se puede cambiar de codificador.' }, 409);
      }
      lote.assigneeId = body?.codificador ?? null;
      return json({ lot: lote.id, codificador: lote.assigneeId });
    }
    if (partes[2] === 'lotes' && partes[3] && partes[4] === 'activo' && method === 'PATCH') {
      const lote = estado.lots.find(l => String(l.id) === partes[3]);
      if (!lote) return json({ error: 'Lote no encontrado.' }, 404);
      lote.active = body?.activo === true;
      return json({ lot: lote.id, activo: lote.active });
    }
    if (partes[2] === 'repartos' && partes[3] && partes[4] === 'activo' && method === 'PATCH') {
      const reparto = estado.lots.filter(l => String(l.repartoId) === partes[3]);
      reparto.forEach(l => { l.active = body?.activo === true; });
      return json({ reparto: Number(partes[3]), activo: body?.activo === true, lots: reparto.length });
    }
    if (partes[2] === 'repartos' && partes[3] && method === 'DELETE') {
      const lotes = estado.lots.filter(l => String(l.repartoId) === partes[3]);
      if (lotes.some(l => l.casos.some(id => estado.cases.find(c => c.id === id)?.decidedBy))) {
        return json({ error: 'Este reparto ya tiene decisiones humanas y no se puede eliminar.' }, 409);
      }
      for (const l of lotes) for (const id of l.casos) { const c = estado.cases.find(x => x.id === id); if (c) delete c.lot; }
      estado.lots = estado.lots.filter(l => String(l.repartoId) !== partes[3]);
      return json({ reparto: Number(partes[3]), deleted: true });
    }
    if (partes[2] === 'lotes' && partes[3] && method === 'DELETE') {
      const lote = estado.lots.find(l => String(l.id) === partes[3]);
      if (!lote) return json({ error: 'Lote no encontrado.' }, 404);
      for (const id of lote.casos) { const c = estado.cases.find(x => x.id === id); if (c) delete c.lot; }
      estado.lots = estado.lots.filter(l => l !== lote);
      return json({ lot: lote.id, deleted: true });
    }
    if (partes[2] === 'lotes' && partes[3] && partes[4] === 'exportar') {
      const lote = estado.lots.find(l => String(l.id) === partes[3]);
      const filas = (lote?.casos || []).map(id => estado.cases.find(c => c.id === id)).map(c => [
        c.id_registro, c.p309, c.p308, '', '', '', '', '', lote.fuente === 'review' ? '' : (c.candidatos[0]?.codigo || ''),
      ].map(v => `"${String(v).replaceAll('"', '""')}"`).join(','));
      const cabecera = 'id_registro,p309,p308,p308a,c309_1,c310,c311,c366,codigo_sugerido';
      return new Response(`${cabecera}\r\n${filas.join('\r\n')}\r\n`, { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
    }
  }

  if (partes[0] === 'api' && partes[1] === 'analytics' && partes[2] === 'datasets' && partes[4] === 'summary') {
    return json(resumenMetricas(partes[3]));
  }
  if (partes[0] === 'api' && partes[1] === 'datasets' && partes[3] === 'coding-dashboard') {
    return json({ coderSectionVisible: false, referenceVisible: false, reference: null, kpis: { matchedWithReference: 0, compared: 0, pending: 0 }, topCodes: [], rates: {} });
  }
  if (path.startsWith('/api/analytics/') || path === '/api/assistant/chat') {
    return json({ answer: 'En la demostración este análisis no está disponible.', rows: [], summary: null });
  }

  if (method === 'GET') return json({});
  return json({ ok: true });
}

// Instala la simulación. Debe llamarse antes de montar la aplicación.
export function instalarApiDemo() {
  sembrarEjemplo();
  const original = window.fetch.bind(window);
  window.fetch = async (entrada, init = {}) => {
    const url = new URL(typeof entrada === 'string' ? entrada : entrada.url, window.location.origin);
    if (!url.pathname.startsWith('/api/')) return original(entrada, init);
    const method = String(init.method || 'GET').toUpperCase();
    let body;
    if (typeof init.body === 'string') {
      try { body = JSON.parse(init.body); } catch { body = undefined; }
    }
    await new Promise(resolve => setTimeout(resolve, 120));
    return responder(method, url.pathname, url.searchParams, body);
  };
}
