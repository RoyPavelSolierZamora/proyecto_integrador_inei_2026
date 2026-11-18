// Temas de ayuda de uso. Las palabras se comparan completas: "ia" no debe encontrarse dentro de "francia".
const HELP_TOPICS = [
  { terms: ['importar', 'cargar', 'csv'], answer: 'Para cargar una base abre “Bases de datos”, indica nombre y periodo, selecciona el CSV original y configura el nivel mínimo de confianza. El sistema valida el archivo antes de iniciar.' },
  { terms: ['umbral', 'confianza', '0.95', '0,95'], answer: 'El nivel mínimo de confianza determina qué casos puede cerrar el clasificador automático. 0,95 prioriza precisión; 0,90 aumenta cobertura y debe validarse con el periodo correspondiente.' },
  { terms: ['exportar', 'descargar', 'resultado'], answer: 'En “Bases de datos” localiza la versión procesada y usa “Exportar”. Los casos pendientes conservan vacío el código final para no confundirlos con resultados validados.' },
  { terms: ['revision', 'revisión', 'codificar', 'confirmar'], answer: 'En “Codificación y revisión” selecciona una base, abre un registro, compara candidatos, antecedentes e IA y confirma un código oficial. Si ninguno corresponde, busca en todo el catálogo CIIU.' },
  { terms: ['asistente', 'qwen'], answer: 'El asistente de IA apoya casos difíciles, pero no reemplaza la decisión humana ni puede inventar códigos fuera de las propuestas recibidas durante la clasificación automática.' },
];

export function normalizeQuestion(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Palabras completas dentro del texto normalizado.
function hasWord(text, term) {
  const needle = normalizeQuestion(term);
  return needle !== '' && ` ${text} `.includes(` ${needle} `);
}

// Saludos cortos ("hola", "buenos días"). Frases más largas con saludo siguen su intención normal.
const GREETING = /^(hola|hey|buenas|buenos dias|buenas tardes|buenas noches|saludos|que tal)\b/;
const THANKS = /^(muchas )?gracias\b|^te agradezco\b/;
const ABOUT = /\b(quien eres|que eres|como te llamas|que puedes hacer|que haces|para que sirves|en que me puedes ayudar)\b/;
// Pedidos de comparación entre clases ("diferencia entre 2310 y 2320", "compara ... con ...").
const COMPARE = /(^| )(diferencias?|compar[a-z]*|parecid[a-z]*|distint[a-z]*|versus|vs|entre)( |$)/;
// Frases que piden comparar las últimas clases de la conversación ("las 2", "las dos").
const FOLLOW_COMPARE = /(^| )(las 2|las dos|las 3|las tres|ambas|ambos|entre ellas|entre ellos|estas dos|esas dos|estos dos|esos dos)( |$)/;
// Preguntas de definición: se responden con el texto oficial, no con datos de la base.
const CONCEPTUAL = /^(que es|que significa|que son|explica|como funciona|para que sirve|que quiere decir)\b/;
const ANALYTIC = /\b(resum\w*|estadistic\w*|cuantos?|cuantas|porcentaje|frecuen\w*|distribucion|pendientes?|indicadores?|cobertura|avance|panorama|automatic\w*|analiz\w*)\b/;
// Frases de seguimiento que se refieren al código de la conversación anterior.
export const FOLLOW_UP = /\b(de que trata|que trata|de que es|sobre eso|de eso|y eso|eso|esa|ese|esto|explicar|explicame|explica)\b/;
// Teclados y risas: no aportan una pregunta.
const KEYBOARD = /(qwer|asdf|zxcv|wert|sdfg|hjkl|uiop|poiu|lkjh|mnbv)/;
const LAUGHTER = /^(ja|je|ji|jo|ju|ha|he|hi|ho|hu)+$/;

// true si el texto normalizado no contiene ninguna palabra con sentido (p. ej. "asdfgh", "???", "zzzz").
export function isNonsense(text) {
  const words = String(text || '').split(' ').filter(Boolean);
  if (!words.length) return true;
  if (/\d{2,}/.test(text)) return false;
  return !words.some(word => word.length >= 3 && /[aeiou]/.test(word) && !/(.)\1\1/.test(word) && !KEYBOARD.test(word) && !LAUGHTER.test(word));
}

export function greetingAnswer(name) {
  const first = String(name || '').trim().split(/\s+/)[0];
  const hello = first ? `Hola, ${first}.` : 'Hola.';
  return `${hello} Puedo ayudarte a cargar una base, revisar códigos, ver el resumen de una base, comparar dos periodos y consultar el control de calidad. ¿Qué necesitas?`;
}

export const NONSENSE_ANSWER = 'No entendí la pregunta. Escríbela con palabras completas, por ejemplo: «¿Qué es la clase 4711?», «¿Cómo cargo una base?» o «Resume la base seleccionada».';

export function socialAnswer(question) {
  if (THANKS.test(normalizeQuestion(question))) return 'De nada. Puedes preguntarme por una clase CIIU, un grupo o cómo usar el sistema.';
  return 'Soy el asistente de codificación EPEN. Respondo sobre la clasificación CIIU Rev.4, los documentos oficiales del INEI que usa el proyecto y el uso de este sistema. Puedo ayudarte a cargar bases, revisar códigos y consultar estadísticas, según tu rol.';
}

// Intención de la pregunta. Las palabras sueltas ("error", "caso", "calidad") no activan datos
// por sí solas: deben acompañar a un contexto de base o de codificación.
export function detectAssistantIntent(question, { compareDatasetId, caseExternalId, previousCodes = [] } = {}) {
  const text = normalizeQuestion(question);
  if (isNonsense(text)) return 'nonsense';
  if (GREETING.test(text) && text.split(' ').length <= 4) return 'greeting';
  if (THANKS.test(text) || ABOUT.test(text)) return 'social';
  const refs = codesInQuestion(question);
  const hasCodes = refs.clases.length > 0 || refs.grupos.length > 0 || refs.divisiones.length > 0;
  const aboutBases = /(^| )(base|bases|periodo|periodos|version|versiones|mes|meses)( |$)/.test(text);
  if (refs.clases.length >= 2 && COMPARE.test(text) && !ANALYTIC.test(text)) return 'code_compare';
  if (!hasCodes && previousCodes.length >= 2 && !aboutBases && FOLLOW_COMPARE.test(text)) return 'code_compare';
  if (hasCodes && !ANALYTIC.test(text)) return 'code';
  if (!hasCodes && previousCodes.length > 0 && FOLLOW_UP.test(text) && !ANALYTIC.test(text)) return 'code';
  if (/(^| )(compar[a-z]*|versus|vs)( |$)/.test(text) || (/(^| )(diferencia|cambio|variacion)[a-z]*( |$)/.test(text) && /(^| )(base|bases|periodo|periodos|mes|meses|version)( |$)/.test(text))) return 'compare_datasets';
  if (/\b(parecid\w*|similar\w*|otros anos|histor\w*)\b/.test(text) || (caseExternalId && /\b(registro|caso|observacion\w*)\b/.test(text))) return 'similar_cases';
  if (CONCEPTUAL.test(text)) return 'help';
  if (/\b(codificadores?|sesgo|correcciones?|desacuerdos?|control de calidad|calidad de la? codificacion)\b/.test(text)) return 'quality_control';
  if (/\b(cruz\w*|variables?|p308|p309|tareas?)\b/.test(text)) return 'variable_profile';
  if (ANALYTIC.test(text)) return 'dataset_summary';
  return 'help';
}

// true si la pregunta coincide con un tema de ayuda de uso conocido.
export function hasHelpTopic(question) {
  const text = normalizeQuestion(question);
  return HELP_TOPICS.some(topic => topic.terms.some(term => hasWord(text, term)));
}

// Referencias CIIU que aparecen en la pregunta: clases (4 dígitos), grupos (3) y divisiones (2),
// nombradas o sueltas. Sirven para buscar el texto oficial que recibe el chat.
export function codesInQuestion(question) {
  const text = normalizeQuestion(question);
  const unique = list => [...new Set(list)].slice(0, 5);
  const named = (word, size) => [...text.matchAll(new RegExp(`\\b${word}\\s+(\\d{${size}})\\b`, 'g'))].map(match => match[1]);
  return {
    // Un código puede venir pegado a una palabra ("codigo2023"): basta que no tenga otro dígito alrededor.
    clases: unique([...(text.match(/(?<!\d)\d{4}(?!\d)/g) || []), ...named('clase', 4)]),
    grupos: unique([...named('grupo', 3)]),
    divisiones: unique([...named('division', 2)]),
  };
}

export function helpAnswer(question) {
  const text = normalizeQuestion(question);
  let best = null;
  for (const topic of HELP_TOPICS) {
    const score = topic.terms.filter(term => hasWord(text, term)).length;
    if (!best || score > best.score) best = { score, answer: topic.answer };
  }
  return best?.score ? best.answer : 'Puedo ayudarte a cargar bases, interpretar el nivel de confianza, revisar códigos, exportar resultados y consultar estadísticas de una base. Indica qué tarea deseas realizar.';
}

export function compareCodeRows(leftRows, rightRows, limit = 10) {
  const left = new Map(leftRows.map(row => [row.code, row]));
  const right = new Map(rightRows.map(row => [row.code, row]));
  return [...new Set([...left.keys(), ...right.keys()])]
    .map(code => {
      const a = left.get(code) || { count: 0, share: 0, description: right.get(code)?.description || '' };
      const b = right.get(code) || { count: 0, share: 0, description: a.description || '' };
      return { code, description: a.description || b.description, leftCount: a.count, rightCount: b.count, leftShare: a.share, rightShare: b.share, change: b.share - a.share };
    })
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || b.rightCount - a.rightCount)
    .slice(0, limit);
}
