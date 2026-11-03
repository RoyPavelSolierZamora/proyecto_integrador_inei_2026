export const ROLE_LABELS = {
  operador: 'Operador de carga',
  analista: 'Analista codificador',
  supervisor: 'Supervisor',
  auditor: 'Auditor de consulta',
  admin: 'Administrador técnico',
};

export const DEMO_USERS = [
  { username: 'operador', password: 'demo2026', name: 'Mario Salazar', role: 'operador' },
  { username: 'analista', password: 'demo2026', name: 'Ana Torres', role: 'analista' },
  { username: 'supervisor', password: 'demo2026', name: 'Carlos Medina', role: 'supervisor' },
  { username: 'auditor', password: 'demo2026', name: 'Lucía Ramos', role: 'auditor' },
  { username: 'admin', password: 'demo2026', name: 'Soporte PEU-CD', role: 'admin' },
];

export const DEMO_CATALOG = [
  ['0146', 'Cría de aves de corral'],
  ['4100', 'Construcción de edificios'],
  ['4711', 'Venta al por menor en comercios no especializados con predominio de alimentos'],
  ['4721', 'Venta al por menor de alimentos en comercios especializados'],
  ['4781', 'Venta al por menor de alimentos, bebidas y tabaco en puestos y mercados'],
  ['4921', 'Transporte urbano y suburbano de pasajeros por vía terrestre'],
  ['4922', 'Otras actividades de transporte por vía terrestre'],
  ['5610', 'Actividades de restaurantes y de servicio móvil de comidas'],
  ['5621', 'Suministro de comidas por encargo'],
  ['5630', 'Actividades de servicio de bebidas'],
  ['6201', 'Programación informática'],
  ['8121', 'Limpieza general de edificios'],
  ['8411', 'Actividades de la administración pública en general'],
  ['8610', 'Actividades de hospitales'],
  ['9700', 'Actividades de los hogares como empleadores de personal doméstico'],
].map(([codigo, descripcion]) => ({ codigo, descripcion }));

const candidate = (codigo, descripcion, prob, rank) => ({ codigo, descripcion, prob, rank });

export const INITIAL_CASES = [
  {
    id_registro: 'EPEN-000128',
    p309: 'Venta de frutas en un puesto del mercado.',
    p308: 'Vendedora de frutas',
    p308a: 'Atiende el puesto, ordena la mercadería y cobra a los clientes.',
    candidatos: [
      candidate('4721', 'Venta de alimentos en comercios especializados', 0.43, 1),
      candidate('4781', 'Venta de alimentos en puestos y mercados', 0.38, 2),
      candidate('4711', 'Comercio no especializado con predominio de alimentos', 0.11, 3),
    ],
    confianza_ml: 0.43,
    estado: 'pendiente',
    codigo_final: null,
    qwen_demo: {
      decision: 'seleccionar', codigo: '4781', confianza_llm: 0.95,
      justificacion: 'La respuesta indica venta de alimentos en un puesto ubicado dentro de un mercado.',
      latencia_s: 18.6,
    },
    qwen: null,
  },
  {
    id_registro: 'EPEN-000204',
    p309: 'Prepara y vende almuerzos en su restaurante.',
    p308: 'Cocinero',
    p308a: 'Prepara menús, atiende pedidos y organiza la cocina.',
    candidatos: [
      candidate('5610', 'Actividades de restaurantes y servicio móvil de comidas', 0.58, 1),
      candidate('5621', 'Suministro de comidas por encargo', 0.23, 2),
      candidate('5630', 'Actividades de servicio de bebidas', 0.09, 3),
    ],
    confianza_ml: 0.58,
    estado: 'pendiente', codigo_final: null,
    qwen_demo: { decision: 'seleccionar', codigo: '5610', confianza_llm: 0.96, justificacion: 'Describe la preparación y venta regular de comidas en un restaurante.', latencia_s: 17.9 },
    qwen: null,
  },
  {
    id_registro: 'EPEN-000319',
    p309: 'Manejo un mototaxi por las calles.',
    p308: 'Conductor de mototaxi',
    p308a: 'Traslada pasajeros y cobra por cada servicio.',
    candidatos: [
      candidate('4922', 'Otras actividades de transporte por vía terrestre', 0.41, 1),
      candidate('4921', 'Transporte urbano y suburbano de pasajeros', 0.39, 2),
      candidate('5610', 'Actividades de restaurantes', 0.02, 3),
    ],
    confianza_ml: 0.41,
    estado: 'revision', codigo_final: null,
    qwen_demo: { decision: 'seleccionar', codigo: '4921', confianza_llm: 0.95, justificacion: 'El texto describe transporte urbano de pasajeros, pero la convención institucional debe verificarse.', latencia_s: 20.1 },
    qwen: { decision: 'seleccionar', codigo: '4921', confianza_llm: 0.95, justificacion: 'El texto describe transporte urbano de pasajeros, pero la convención institucional debe verificarse.', latencia_s: 20.1 },
  },
  {
    id_registro: 'EPEN-000411',
    p309: 'Limpia departamentos y oficinas por horas.',
    p308: 'Personal de limpieza',
    p308a: 'Barre, trapea y desinfecta ambientes.',
    candidatos: [
      candidate('8121', 'Limpieza general de edificios', 0.71, 1),
      candidate('9700', 'Hogares como empleadores de personal doméstico', 0.17, 2),
      candidate('8411', 'Administración pública en general', 0.02, 3),
    ],
    confianza_ml: 0.71,
    estado: 'confirmado', codigo_final: '8121',
    qwen_demo: { decision: 'seleccionar', codigo: '8121', confianza_llm: 0.96, justificacion: 'La actividad principal es la limpieza general de distintos edificios.', latencia_s: 16.4 },
    qwen: { decision: 'seleccionar', codigo: '8121', confianza_llm: 0.96, justificacion: 'La actividad principal es la limpieza general de distintos edificios.', latencia_s: 16.4 },
  },
  {
    id_registro: 'EPEN-000566',
    p309: 'Hace páginas web y sistemas para pequeños negocios.',
    p308: 'Programador',
    p308a: 'Diseña, programa y mantiene aplicaciones web.',
    candidatos: [
      candidate('6201', 'Programación informática', 0.84, 1),
      candidate('8411', 'Administración pública en general', 0.04, 2),
      candidate('4100', 'Construcción de edificios', 0.02, 3),
    ],
    confianza_ml: 0.84,
    estado: 'confirmado', codigo_final: '6201',
    qwen_demo: { decision: 'seleccionar', codigo: '6201', confianza_llm: 0.98, justificacion: 'La actividad corresponde al desarrollo y mantenimiento de programas informáticos.', latencia_s: 15.7 },
    qwen: null,
  },
  {
    id_registro: 'EPEN-000608',
    p309: 'Trabajo cuidando la casa y cocinando para una familia.',
    p308: 'Trabajadora del hogar',
    p308a: 'Cocina, limpia y apoya en el cuidado de la vivienda.',
    candidatos: [
      candidate('9700', 'Hogares como empleadores de personal doméstico', 0.79, 1),
      candidate('8121', 'Limpieza general de edificios', 0.12, 2),
      candidate('5610', 'Actividades de restaurantes', 0.03, 3),
    ],
    confianza_ml: 0.79,
    estado: 'corregido', codigo_final: '9700',
    qwen_demo: { decision: 'seleccionar', codigo: '9700', confianza_llm: 0.97, justificacion: 'Se trata de trabajo doméstico realizado para un hogar particular.', latencia_s: 17.2 },
    qwen: { decision: 'seleccionar', codigo: '8121', confianza_llm: 0.92, justificacion: 'La respuesta menciona labores de limpieza, aunque el contexto del empleador requiere revisión.', latencia_s: 17.2 },
  },
];

export const INITIAL_EVENTS = [
  { id: 1, caseId: 'EPEN-000411', action: 'confirmación', code: '8121', user: 'Ana Torres', at: '2026-11-02T09:20:00-05:00' },
  { id: 2, caseId: 'EPEN-000566', action: 'confirmación', code: '6201', user: 'Ana Torres', at: '2026-11-02T09:34:00-05:00' },
  { id: 3, caseId: 'EPEN-000608', action: 'corrección', code: '9700', user: 'Carlos Medina', at: '2026-11-02T10:05:00-05:00' },
  { id: 4, caseId: 'EPEN-000319', action: 'derivación', code: null, user: 'Ana Torres', at: '2026-11-02T10:18:00-05:00' },
];
