import { useCallback, useEffect, useMemo, useState } from 'react';
import { useData } from '../state/DataContext';

export default function useDatasetWorkspace(requestedDatasetId) {
  const { cases: activeCases, events: activeEvents, datasets, activeDataset, loadDatasetWorkspace, reload } = useData();
  const selectedDataset = useMemo(() => {
    const requested = datasets.find(item => String(item.id) === String(requestedDatasetId));
    return requested || activeDataset || datasets[0] || null;
  }, [datasets, activeDataset, requestedDatasetId]);
  const selectedIsActive = Boolean(selectedDataset && activeDataset && String(selectedDataset.id) === String(activeDataset.id));
  const [remote, setRemote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!selectedDataset) return;
    setError('');
    if (selectedIsActive) {
      await reload({ silent: true });
      return;
    }
    setLoading(true);
    try { setRemote(await loadDatasetWorkspace(selectedDataset.id)); }
    catch (cause) { setError(cause.message || 'No se pudo cargar la base seleccionada.'); }
    finally { setLoading(false); }
  }, [selectedDataset?.id, selectedIsActive, loadDatasetWorkspace, reload]);

  useEffect(() => {
    let current = true;
    if (!selectedDataset || selectedIsActive) {
      setRemote(null);
      setLoading(false);
      setError('');
      return () => { current = false; };
    }
    setLoading(true);
    setError('');
    loadDatasetWorkspace(selectedDataset.id)
      .then(data => { if (current) setRemote(data); })
      .catch(cause => { if (current) setError(cause.message || 'No se pudo cargar la base seleccionada.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [selectedDataset?.id, selectedIsActive, loadDatasetWorkspace]);

  const remoteMatches = remote && selectedDataset && String(remote.dataset?.id) === String(selectedDataset.id);
  return {
    selectedDataset,
    cases: selectedIsActive ? activeCases : remoteMatches ? remote.cases || [] : [],
    events: selectedIsActive ? activeEvents : remoteMatches ? remote.events || [] : [],
    loading,
    error,
    refresh,
  };
}
