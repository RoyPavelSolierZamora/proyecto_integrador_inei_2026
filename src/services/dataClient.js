import { apiRequest } from './authClient';

export const loadOperationalData = () => apiRequest('/api/data/bootstrap');

export const getR3Health = () => apiRequest('/api/system/r3-health');
export const getR2Health = () => apiRequest('/api/system/r2-health');
export const listR2JobsReal = () => apiRequest('/api/r2/jobs');

export async function exportDatasetReal(datasetId) {
  const response = await fetch(`/api/datasets/${encodeURIComponent(datasetId)}/export`, {
    credentials: 'include', headers: { Accept: 'text/csv' },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'No se pudo exportar la base.');
  }
  return response.blob();
}

export const startR2JobReal = ({ name, period, fileName, threshold, synthetic, qwenMode, csvText }) => {
  const query = new URLSearchParams({ name, period, fileName, threshold: String(threshold), synthetic: String(synthetic), qwenMode });
  return apiRequest(`/api/r2/jobs?${query}`, {
    method: 'POST', mutation: true, rawBody: csvText, contentType: 'text/csv; charset=utf-8',
  });
};

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

