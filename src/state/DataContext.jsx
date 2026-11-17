import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { activateDatasetReal, consultQwenReal, importDatasetReal, loadDatasetWorkspaceReal, loadOperationalData, saveDecisionReal, searchCatalogPageReal, searchCatalogReal, simulateR2Real } from '../services/dataClient';
import { useAuth } from './AuthContext';

const DataContext = createContext(null);
const emptyState = () => ({ cases: [], events: [], datasets: [], activeDatasetId: null });

function stateFromApi(data) {
  return {
    cases: data.cases || [],
    events: data.events || [],
    datasets: data.datasets || [],
    activeDatasetId: data.activeDataset?.id || null,
  };
}

export function DataProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [workspace, setWorkspace] = useState(emptyState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function reload({ silent = false } = {}) {
    if (!user) return;
    if (!silent) setLoading(true);
    setError('');
    try { setWorkspace(stateFromApi(await loadOperationalData())); }
    catch (cause) { setError(cause.message || 'No se pudieron cargar los datos operativos.'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (authLoading) return;
    if (user) reload();
    else {
      setWorkspace(emptyState());
      setLoading(false);
      setError('');
    }
  }, [authLoading, user?.username]);

  async function consultQwen(datasetId, caseId) {
    const response = await consultQwenReal(datasetId, caseId);
    if (String(datasetId) === String(workspace.activeDatasetId)) await reload({ silent: true });
    return response.result;
  }

  async function decide(datasetId, caseId, action, code, justification = '') {
    await saveDecisionReal(datasetId, caseId, action, code, justification);
    if (String(datasetId) === String(workspace.activeDatasetId)) await reload({ silent: true });
  }

  async function loadDatasetWorkspace(datasetId) {
    return loadDatasetWorkspaceReal(datasetId);
  }

  async function activateDataset(datasetId) {
    await activateDatasetReal(datasetId);
    await reload({ silent: true });
  }

  async function importDataset(input) {
    await importDatasetReal(input);
    await reload({ silent: true });
  }

  async function simulateR2(datasetId, threshold) {
    const result = await simulateR2Real(datasetId, threshold);
    await reload({ silent: true });
    return result;
  }

  async function searchCatalog(query) {
    return searchCatalogReal(query);
  }

  async function searchCatalogPage(query, options) {
    return searchCatalogPageReal(query, options);
  }

  const activeDataset = useMemo(
    () => workspace.datasets.find(item => item.id === workspace.activeDatasetId) || workspace.datasets[0] || null,
    [workspace.datasets, workspace.activeDatasetId],
  );
  const activeCases = useMemo(
    () => workspace.cases.filter(item => !activeDataset || String(item.dataset_id) === String(activeDataset.id)),
    [workspace.cases, activeDataset],
  );
  const metrics = useMemo(() => {
    const total = activeCases.length;
    const confirmed = activeCases.filter(item => ['confirmado', 'corregido'].includes(item.estado)).length;
    const review = activeCases.filter(item => item.estado === 'revision').length;
    const pending = activeCases.filter(item => item.estado === 'pendiente').length;
    const latencies = activeCases.map(item => item.qwen?.latencia_s).filter(Number.isFinite);
    return {
      total, confirmed, review, pending,
      coverage: total ? confirmed / total : 0,
      reviewRate: total ? review / total : 0,
      avgLatency: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
    };
  }, [activeCases]);

  const value = useMemo(() => ({
    cases: activeCases,
    allCases: workspace.cases,
    events: workspace.events,
    datasets: workspace.datasets,
    activeDataset,
    metrics,
    loading,
    error,
    real: true,
    reload,
    loadDatasetWorkspace,
    consultQwen,
    decide,
    activateDataset,
    importDataset,
    simulateR2,
    searchCatalog,
    searchCatalogPage,
  }), [workspace, activeCases, activeDataset, metrics, loading, error]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData debe utilizarse dentro de DataProvider');
  return context;
}
