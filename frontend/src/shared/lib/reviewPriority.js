export const REVIEW_PRIORITIES = [
  { key: 'urgente', label: 'Revisión urgente', range: '0–20 %', max: 20, tone: 'bg-danger-soft text-danger' },
  { key: 'prioritaria', label: 'Revisión prioritaria', range: '21–40 %', max: 40, tone: 'bg-orange-100 text-orange-900' },
  { key: 'detallada', label: 'Revisión detallada', range: '41–60 %', max: 60, tone: 'bg-amber-100 text-amber-900' },
  { key: 'regular', label: 'Revisión regular', range: '61–80 %', max: 80, tone: 'bg-brand-soft text-navy' },
  { key: 'final', label: 'Verificación final', range: '81–100 %', max: 100, tone: 'bg-teal-50 text-teal-900' },
  { key: 'sin_confianza', label: 'Sin confianza disponible', range: '', tone: 'bg-line text-muted' },
];

// Se usa el mismo porcentaje entero para mostrar y filtrar, sin huecos entre rangos.
// El cero es un puntaje valido; null o valores invalidos significan que no hay puntaje.
export function confidencePercent(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1 ? Math.round(value * 100) : null;
}

export function reviewPriority(value) {
  const percent = confidencePercent(value);
  return percent === null
    ? REVIEW_PRIORITIES[5]
    : REVIEW_PRIORITIES.find(priority => percent <= priority.max);
}
