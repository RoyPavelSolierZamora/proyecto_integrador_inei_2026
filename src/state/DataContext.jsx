import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DEMO_CATALOG, INITIAL_CASES, INITIAL_EVENTS } from '../data/demoData';
import { activateDatasetReal, consultQwenReal, importDatasetReal, loadOperationalData, saveDecisionReal, searchCatalogReal, simulateR2Real } from '../services/dataClient';
import { consultarQwen, runtimeConfig } from '../services/r3Client';
import { useAuth } from './AuthContext';

const DataContext = createContext(null);
const STORAGE_KEY = 'epen-demo-workspace-v1';
const DEFAULT_DATASET_ID = 'epen-demo-2026';

function defaultDataset() {
  return { id: DEFAULT_DATASET_ID, name: 'EPEN · Demostración', period: '2026', fileName: 'casos_sinteticos', records: INITIAL_CASES.length, importedAt: '2026-11-02T08:00:00-05:00', importedBy: 'Sistema', synthetic: true };
}

function freshState() {
  return {
    cases: structuredClone(INITIAL_CASES).map(item => ({ ...item, dataset_id: DEFAULT_DATASET_ID })),
    events: structuredClone(INITIAL_EVENTS).map(item => ({ ...item, datasetId: DEFAULT_DATASET_ID })),
    datasets: [defaultDataset()], activeDatasetId: DEFAULT_DATASET_ID,
  };
}

function emptyState() {
  return { cases: [], events: [], datasets: [], activeDatasetId: null };
}

function normalizeState(saved) {
  if (!saved || !Array.isArray(saved.cases) || !Array.isArray(saved.events)) return freshState();
  const datasets = Array.isArray(saved.datasets) && saved.datasets.length ? saved.datasets : [defaultDataset()];
  const activeDatasetId = datasets.some(item => item.id === saved.activeDatasetId) ? saved.activeDatasetId : datasets[0].id;
  return {
    cases: saved.cases.map(item => ({ ...item, dataset_id: item.dataset_id || DEFAULT_DATASET_ID })),
    events: saved.events.map(item => ({ ...item, datasetId: item.datasetId || DEFAULT_DATASET_ID })),
    datasets, activeDatasetId,
  };
}

function readState() {
  try { return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
  catch { return freshState(); }
}

function stateFromApi(data) {
  return {
    cases: data.cases || [], events: data.events || [], datasets: data.datasets || [],
    activeDatasetId: data.activeDataset?.id || null,
  };
}

export function DataProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const real = runtimeConfig.dataMode === 'real';
  const [workspace, setWorkspace] = useState(() => real ? emptyState() : readState());
  const [loading, setLoading] = useState(real);
  const [error, setError] = useState('');

  async function reload({ silent = false } = {}) {
    if (!real || !user) return;
    if (!silent) setLoading(true);
    setError('');
    try { setWorkspace(stateFromApi(await loadOperationalData())); }
    catch (cause) { setError(cause.message || 'No se pudieron cargar los datos operativos.'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!real) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
      setLoading(false);
      return;
    }
    if (!authLoading && user) reload();
    if (!authLoading && !user) setLoading(false);
  }, [real, authLoading, user?.username]);

  function setQwenResult(caseId, result, actor) {
    if (real) return;
    setWorkspace(current => ({
      ...current,
      cases: current.cases.map(item => item.id_registro === caseId ? { ...item, qwen: result } : item),
      events: [...current.events, { id: Date.now(), caseId, action: 'consulta Qwen', code: result?.codigo || null, user: actor.name, at: new Date().toISOString() }],
    }));
  }

  async function consultQwen(caseId, item, actor) {
    if (real) {
      const response = await consultQwenReal(caseId);
      await reload({ silent: true });
      return response.result;
    }
    const result = await consultarQwen(item);
    setQwenResult(caseId, result, actor);
    return result;
  }

  async function decide(caseId, action, code, actor) {
    if (real) {
      await saveDecisionReal(caseId, action, code);
      await reload({ silent: true });
      return;
    }
    const statusByAction = { confirmación: 'confirmado', corrección: 'corregido', derivación: 'revision' };
    setWorkspace(current => ({
      ...current,
      cases: current.cases.map(item => item.id_registro === caseId ? { ...item, estado: statusByAction[action], codigo_final: action === 'derivación' ? null : code, updated_at: new Date().toISOString() } : item),
      events: [...current.events, { id: Date.now(), caseId, action, code: action === 'derivación' ? null : code, user: actor.name, at: new Date().toISOString() }],
    }));
  }

  function resetDemo() {
    if (!real) setWorkspace(freshState());
  }

  async function activateDataset(datasetId) {
    if (real) {
      await activateDatasetReal(datasetId);
      await reload({ silent: true });
    } else if (workspace.datasets.some(item => item.id === datasetId)) {
      setWorkspace(current => ({ ...current, activeDatasetId: datasetId }));
    }
  }

  async function importDataset(input) {
    if (real) {
      await importDatasetReal(input);
      await reload({ silent: true });
      return;
    }
    const datasetId = `base-${Date.now()}`;
    const prepared = input.rows.map(item => ({ ...item, dataset_id: datasetId }));
    setWorkspace(current => ({
      ...current, cases: [...current.cases, ...prepared],
      datasets: [...current.datasets, { id: datasetId, name: input.name.trim(), period: input.period.trim(), fileName: input.fileName, records: prepared.length, importedAt: new Date().toISOString(), importedBy: 'Usuario demo' }],
      activeDatasetId: datasetId,
    }));
  }

  async function simulateR2(datasetId, threshold) {
    if (!real) throw new Error('La simulación R2 con umbral requiere el backend real.');
    const result = await simulateR2Real(datasetId, threshold);
    await reload({ silent: true });
    return result;
  }

  async function searchCatalog(query) {
    if (real) return searchCatalogReal(query);
    const normalized = query.trim().toLowerCase();
    return DEMO_CATALOG.filter(row => !normalized || `${row.codigo} ${row.descripcion}`.toLowerCase().includes(normalized)).slice(0, 20);
  }

  const activeDataset = useMemo(() => workspace.datasets.find(item => item.id === workspace.activeDatasetId) || workspace.datasets[0] || null, [workspace.datasets, workspace.activeDatasetId]);
  const activeCases = useMemo(() => workspace.cases.filter(item => !activeDataset || String(item.dataset_id) === String(activeDataset.id)), [workspace.cases, activeDataset]);
  const metrics = useMemo(() => {
    const total = activeCases.length;
    const confirmed = activeCases.filter(item => ['confirmado', 'corregido'].includes(item.estado)).length;
    const review = activeCases.filter(item => item.estado === 'revision').length;
    const pending = activeCases.filter(item => item.estado === 'pendiente').length;
    const latencies = activeCases.map(item => item.qwen?.latencia_s).filter(Number.isFinite);
    return { total, confirmed, review, pending, coverage: total ? confirmed / total : 0, reviewRate: total ? review / total : 0, avgLatency: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0 };
  }, [activeCases]);

  const value = useMemo(() => ({
    cases: activeCases, allCases: workspace.cases, events: workspace.events,
    datasets: workspace.datasets, activeDataset, metrics, loading, error, real,
    reload, consultQwen, decide, resetDemo, activateDataset, importDataset, simulateR2, searchCatalog,
  }), [workspace, activeCases, activeDataset, metrics, loading, error, real]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData debe utilizarse dentro de DataProvider');
  return context;
}

