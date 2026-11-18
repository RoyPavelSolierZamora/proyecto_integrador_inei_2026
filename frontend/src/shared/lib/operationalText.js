// Presentation only: never change stored evidence, API payloads or identifiers.
export function operationalText(value) {
  if (value == null) return '';
  return String(value)
    .replace(/\bQwen\b/gi, 'el asistente de IA')
    .replace(/\bR2\b/g, 'la clasificación automática')
    .replace(/\bR3\b/g, 'la asistencia de IA');
}
