// Clases comunes para tablas. En escritorio son tablas normales con desplazamiento
// horizontal si hace falta. En móvil cada fila se convierte en una ficha y cada celda
// muestra su encabezado tomado de data-label.
export const tableClasses = {
  wrap: 'overflow-x-auto rounded-xl border border-line bg-surface max-md:overflow-visible max-md:border-0 max-md:bg-transparent',
  table: 'w-full text-left text-sm md:min-w-[760px] max-md:block',
  head: 'bg-[#f5f8fd] text-muted max-md:sr-only',
  th: 'px-4 py-3 font-semibold',
  body: 'max-md:block',
  row: 'border-t border-line align-middle max-md:mb-3 max-md:grid max-md:gap-2 max-md:rounded-xl max-md:border max-md:bg-surface max-md:p-4',
  cell: '[overflow-wrap:anywhere] px-4 py-3 max-md:grid max-md:grid-cols-[110px_minmax(0,1fr)] max-md:items-center max-md:gap-2 max-md:px-0 max-md:py-1 max-md:before:text-xs max-md:before:font-semibold max-md:before:text-muted max-md:before:content-[attr(data-label)]',
};
