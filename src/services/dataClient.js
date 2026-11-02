import { apiRequest } from './authClient';

export const loadOperationalData = () => apiRequest('/api/data/bootstrap');

export const getR3Health = () => apiRequest('/api/system/r3-health');

export const saveDecisionReal = (caseId, action, code) => apiRequest(`/api/cases/${encodeURIComponent(caseId)}/decision`, {
  method: 'POST', mutation: true, body: { action, code },
});

export const consultQwenReal = caseId => apiRequest(`/api/cases/${encodeURIComponent(caseId)}/qwen`, {
  method: 'POST', mutation: true, body: {},
});

export const activateDatasetReal = datasetId => apiRequest(`/api/admin/datasets/${datasetId}/activate`, {
  method: 'POST', mutation: true, body: {},
});

export const simulateR2Real = (datasetId, threshold) => apiRequest(`/api/admin/datasets/${datasetId}/simulate-r2`, {
  method: 'POST', mutation: true, body: { threshold },
});

export const importDatasetReal = input => apiRequest('/api/admin/datasets', {
  method: 'POST', mutation: true, body: input,
});

export async function searchCatalogReal(query) {
  const data = await apiRequest(`/api/catalog?q=${encodeURIComponent(query || '')}`);
  return data.rows;
}

