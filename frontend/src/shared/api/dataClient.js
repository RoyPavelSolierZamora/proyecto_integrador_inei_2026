import { apiRequest } from './authClient.js';

export const loadOperationalData = () => apiRequest('/api/data/bootstrap');
export const loadDatasetWorkspaceReal = datasetId => apiRequest(`/api/datasets/${encodeURIComponent(datasetId)}/workspace`);
export const getDatasetHistoryReal = (datasetId, { limit = 30, offset = 0, query = '', source = 'all' } = {}) => {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset), q: query, source });
  return apiRequest(`/api/datasets/${encodeURIComponent(datasetId)}/history?${params}`);
};

export const getR3Health = () => apiRequest('/api/system/r3-health');
export const getR2Health = () => apiRequest('/api/system/r2-health');
export const listR2JobsReal = () => apiRequest('/api/r2/jobs');
export const cancelR2JobReal = jobId => apiRequest(`/api/r2/jobs/${encodeURIComponent(jobId)}/cancel`, {
  method: 'POST', mutation: true, body: {},
});

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

export const startR2JobReal = ({ name, period, fileName, threshold, aiThreshold = '', synthetic, qwenMode, csvText }) => {
  const query = new URLSearchParams({ name, period, fileName, threshold: String(threshold), synthetic: String(synthetic), qwenMode, aiThreshold: String(aiThreshold ?? '') });
  return apiRequest(`/api/r2/jobs?${query}`, {
    method: 'POST', mutation: true, rawBody: csvText, contentType: 'text/csv; charset=utf-8',
  });
};

export const saveDecisionReal = (datasetId, caseId, action, code, justification = '') => apiRequest(`/api/datasets/${encodeURIComponent(datasetId)}/cases/${encodeURIComponent(caseId)}/decision`, {
  method: 'POST', mutation: true, body: { action, code, justification },
});

export const consultQwenReal = (datasetId, caseId) => apiRequest(`/api/datasets/${encodeURIComponent(datasetId)}/cases/${encodeURIComponent(caseId)}/qwen`, {
  method: 'POST', mutation: true, body: {},
});

export const activateDatasetReal = datasetId => apiRequest(`/api/admin/datasets/${datasetId}/activate`, {
  method: 'POST', mutation: true, body: {},
});

export const simulateR2Real = (datasetId, threshold) => apiRequest(`/api/admin/datasets/${datasetId}/simulate-r2`, {
  method: 'POST', mutation: true, body: { threshold },
});

export const updateDatasetSyntheticReal = (datasetId, synthetic) => apiRequest(`/api/admin/datasets/${datasetId}/synthetic`, {
  method: 'PATCH', mutation: true, body: { synthetic },
});

export const importDatasetReal = input => apiRequest('/api/admin/datasets', {
  method: 'POST', mutation: true, body: input,
});

export async function searchCatalogReal(query) {
  const data = await apiRequest(`/api/catalog?q=${encodeURIComponent(query || '')}`);
  return data.rows;
}

export async function searchCatalogPageReal(query, { limit = 30, offset = 0 } = {}) {
  const params = new URLSearchParams({ q: query || '', limit: String(limit), offset: String(offset) });
  const data = await apiRequest(`/api/catalog?${params.toString()}`);
  const rows = data.rows || [];
  return { rows, total: Number.isFinite(Number(data.total)) ? Number(data.total) : rows.length };
}

export const getDatasetSummaryReal = datasetId => apiRequest(`/api/analytics/datasets/${encodeURIComponent(datasetId)}/summary`);
export const compareDatasetsReal = (left, right) => apiRequest(`/api/analytics/compare?left=${encodeURIComponent(left)}&right=${encodeURIComponent(right)}`);
export const getQualitySummaryReal = datasetId => apiRequest(`/api/analytics/datasets/${encodeURIComponent(datasetId)}/quality`);
export const getSimilarCasesReal = (datasetId, caseId) => apiRequest(`/api/analytics/datasets/${encodeURIComponent(datasetId)}/cases/${encodeURIComponent(caseId)}/similar`);
export const askAssistantReal = input => apiRequest('/api/assistant/chat', { method: 'POST', mutation: true, body: input });

export const listCodingRulesReal = status => apiRequest(`/api/coding-rules${status ? `?status=${encodeURIComponent(status)}` : ''}`);
export const getCaseCodingRulesReal = (datasetId, caseId) => apiRequest(`/api/datasets/${encodeURIComponent(datasetId)}/cases/${encodeURIComponent(caseId)}/coding-rules`);
export const createCodingRuleReal = input => apiRequest('/api/coding-rules', { method: 'POST', mutation: true, body: input });
export const updateCodingRuleReal = (id, input) => apiRequest(`/api/coding-rules/${encodeURIComponent(id)}`, { method: 'PATCH', mutation: true, body: input });
export const updateCodingRuleStatusReal = (id, status) => apiRequest(`/api/coding-rules/${encodeURIComponent(id)}/status`, { method: 'PATCH', mutation: true, body: { status } });
export const listCatalogChangeRequestsReal = () => apiRequest('/api/catalog-change-requests');
export const createCatalogChangeRequestReal = input => apiRequest('/api/catalog-change-requests', { method: 'POST', mutation: true, body: input });
export const reviewCatalogChangeRequestReal = (id, status, reviewNotes = '') => apiRequest(`/api/catalog-change-requests/${encodeURIComponent(id)}/status`, { method: 'PATCH', mutation: true, body: { status, reviewNotes } });

export const listQualityReviewsReal = (datasetId, caseId) => apiRequest(`/api/datasets/${encodeURIComponent(datasetId)}/cases/${encodeURIComponent(caseId)}/quality-reviews`);
export const createQualityReviewReal = (datasetId, caseId, input) => apiRequest(`/api/datasets/${encodeURIComponent(datasetId)}/cases/${encodeURIComponent(caseId)}/quality-reviews`, { method: 'POST', mutation: true, body: input });
export const getQualitySampleReal = (datasetId, { limit = 20, seed = '', source = '', band = '' } = {}) => {
  const params = new URLSearchParams({ limit: String(limit), seed, source, band });
  return apiRequest(`/api/datasets/${encodeURIComponent(datasetId)}/quality-sample?${params.toString()}`);
};
export const submitBlindVerdictReal = (datasetId, decisionId, code) => apiRequest(`/api/datasets/${encodeURIComponent(datasetId)}/quality-sample/${encodeURIComponent(decisionId)}/verdict`, { method: 'POST', mutation: true, body: { code } });
export const getQualityMetricsReal = datasetId => apiRequest(`/api/datasets/${encodeURIComponent(datasetId)}/quality-metrics`);
export const listReferenceDatasetsReal = () => apiRequest('/api/reference-datasets');
export const setReferenceActivationReal = (id, active) => apiRequest(`/api/reference-datasets/${encodeURIComponent(id)}/activation`, { method: 'PATCH', mutation: true, body: { active } });
export const getCodingDashboardReal = datasetId => apiRequest(`/api/datasets/${encodeURIComponent(datasetId)}/coding-dashboard`);
export const importReferenceDatasetReal = input => apiRequest('/api/datasets/import-reference', { method: 'POST', mutation: true, body: input });
export const getReferenceComparisonReal = (datasetId, referenceId) => apiRequest(`/api/datasets/${encodeURIComponent(datasetId)}/reference-comparison?reference=${encodeURIComponent(referenceId)}`);
export const getCaseReferenceReal = (datasetId, externalId) => apiRequest(`/api/datasets/${encodeURIComponent(datasetId)}/cases/${encodeURIComponent(externalId)}/reference`);
export const setUserAnalystCodeReal = (id, analystCode) => apiRequest(`/api/admin/users/${encodeURIComponent(id)}/analyst-code`, { method: 'PATCH', mutation: true, body: { analystCode } });

