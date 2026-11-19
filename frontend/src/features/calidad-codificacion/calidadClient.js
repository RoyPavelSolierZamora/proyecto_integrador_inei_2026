// Cliente del módulo «Calidad de codificación». Las rutas están en backend/src/routes/calidad-codificacion-routes.js.
import { apiRequest } from '../../shared/api/authClient.js';

export const listAnalystsReal = () => apiRequest('/api/calidad-codificacion/usuarios');

export const listBasesReal = () => apiRequest('/api/calidad-codificacion/bases');

export const previewRepartoReal = asignaciones => apiRequest('/api/calidad-codificacion/previsualizar', {
  method: 'POST',
  body: { asignaciones },
});

export const createRepartoReal = (asignaciones, nombre) => apiRequest('/api/calidad-codificacion/reparto', {
  method: 'POST',
  mutation: true,
  body: { asignaciones, nombre },
});

export const deleteRepartoReal = reparto => apiRequest(`/api/calidad-codificacion/repartos/${encodeURIComponent(reparto)}`, {
  method: 'DELETE',
  mutation: true,
});

export const reassignLoteReal = (lot, codificador) => apiRequest(`/api/calidad-codificacion/lotes/${encodeURIComponent(lot)}/codificador`, {
  method: 'PATCH',
  mutation: true,
  body: { codificador },
});

// Activo = visible para el codificador. Inactivo = oculto, sin borrar casos ni decisiones.
export const setRepartoActivoReal = (reparto, activo) => apiRequest(`/api/calidad-codificacion/repartos/${encodeURIComponent(reparto)}/activo`, {
  method: 'PATCH',
  mutation: true,
  body: { activo },
});

export const setLoteActivoReal = (lot, activo) => apiRequest(`/api/calidad-codificacion/lotes/${encodeURIComponent(lot)}/activo`, {
  method: 'PATCH',
  mutation: true,
  body: { activo },
});

export const deleteLoteReal = lot => apiRequest(`/api/calidad-codificacion/lotes/${encodeURIComponent(lot)}`, {
  method: 'DELETE',
  mutation: true,
});

export const getResumenReal = base => apiRequest(`/api/calidad-codificacion/resumen${base ? `?base=${encodeURIComponent(base)}` : ''}`);

export const getMisLotesReal = () => apiRequest('/api/mis-lotes');

export const getMisLoteCasosReal = lot => apiRequest(`/api/mis-lotes/${encodeURIComponent(lot)}/casos`);

export async function downloadLoteReal(lot) {
  const response = await fetch(`/api/calidad-codificacion/lotes/${encodeURIComponent(lot)}/exportar`, {
    credentials: 'include',
    headers: { Accept: 'text/csv' },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'No se pudo descargar el lote.');
  }
  return response.blob();
}
