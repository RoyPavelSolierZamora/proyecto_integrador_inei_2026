import EpenIcon from '../ui/EpenIcon.jsx';
import Button from '../ui/Button.jsx';

const formatDate = value => new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

// Estado de una versión con punto de color: en uso, procesando, cancelada, fallida o anterior.
function stateOf(dataset, active) {
  if (active) return { label: 'En uso', chip: 'bg-[#e4f7ec] text-[#05603a]', dot: 'bg-[#2f9e6b]' };
  if (dataset.status === 'staging') return { label: 'Procesando', chip: 'bg-brand-soft text-navy', dot: 'bg-brand' };
  if (dataset.status === 'cancelled') return { label: 'Cancelada', chip: 'bg-line text-muted', dot: 'bg-muted' };
  if (dataset.status === 'failed') return { label: 'Falló', chip: 'bg-danger-soft text-danger', dot: 'bg-danger' };
  return { label: 'Anterior', chip: 'bg-line text-muted', dot: 'bg-muted' };
}

// Columnas fijas en escritorio: el estado y las acciones no cambian de posición entre filas.
const desktopColumns = 'md:grid-cols-[minmax(0,2.2fr)_96px_minmax(0,1.5fr)_88px_136px_104px]';
const cell = 'grid content-center gap-0.5 text-sm md:py-3 md:pr-4';
const mobileLabel = 'text-xs font-semibold text-muted md:hidden';

export default function DatasetHistoryTable({ datasets, activeId, admin, saving, exportingId, onActivate, onExport }) {
  return (
    <div role="list" aria-label="Historial de bases" className="grid grid-cols-1 gap-3 md:gap-0">
      <div aria-hidden="true" className={`hidden gap-4 border-b border-line pb-2 text-xs font-semibold uppercase tracking-wide text-muted md:grid ${desktopColumns}`}>
        <span>Base</span><span>Periodo</span><span>Importación</span><span>Registros</span><span>Estado</span><span className="text-right">Acciones</span>
      </div>

      {datasets.map(dataset => {
        const active = dataset.id === activeId;
        const state = stateOf(dataset, active);
        const canActivate = !active && dataset.status !== 'staging' && dataset.status !== 'failed' && dataset.status !== 'cancelled' && admin;
        const exporting = exportingId === dataset.id;
        return (
          <article
            key={dataset.id}
            role="listitem"
            className={[
              'grid grid-cols-1 gap-3 rounded-xl border p-4 md:items-center md:gap-4 md:rounded-none md:border-x-0 md:border-b-0 md:border-t md:border-line md:p-0',
              desktopColumns,
              active ? 'border-brand bg-brand-soft/40' : 'border-line bg-surface',
            ].join(' ')}
          >
            <div className="flex min-w-0 items-center gap-3 md:py-3">
              <span aria-hidden="true" className="grid size-9 flex-none place-items-center rounded-lg bg-brand-soft text-brand">
                <EpenIcon name="filetype-csv" />
              </span>
              <div className="grid min-w-0 gap-0.5">
                <strong title={dataset.name} className="truncate text-sm text-ink-strong">{dataset.name}</strong>
                <small className="truncate text-xs text-muted">{dataset.fileName}</small>
              </div>
            </div>

            <div className={cell}>
              <span className={mobileLabel}>Periodo</span>
              <span className="text-ink">{dataset.period || 'Sin periodo'}</span>
            </div>

            <div className={cell}>
              <span className={mobileLabel}>Importación</span>
              <span className="text-ink">{formatDate(dataset.importedAt)}</span>
              <small className="truncate text-xs text-muted">Por {dataset.importedBy}</small>
            </div>

            <div className={cell}>
              <span className={mobileLabel}>Registros</span>
              <span className="tabular-nums text-ink">{Number(dataset.records || 0).toLocaleString('es-PE')}</span>
            </div>

            <div className={cell}>
              <span className={mobileLabel}>Estado</span>
              <span className={['inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', state.chip].join(' ')}>
                <span aria-hidden="true" className={['size-1.5 rounded-full', state.dot].join(' ')} />
                {state.label}
              </span>
            </div>

            {/* Ancho fijo: si no hay botón de usar, se reserva el mismo espacio para no mover la fila. */}
            <div className="flex items-center gap-2 md:justify-end">
              {admin && (
                canActivate ? (
                  <Button
                    variant="secondary"
                    size="icon"
                    className="text-[#2f9e6b]"
                    title="Usar esta base"
                    aria-label={`Usar la base ${dataset.name}`}
                    disabled={saving}
                    onClick={() => onActivate(dataset.id)}
                  >
                    <EpenIcon name="check-circle" />
                  </Button>
                ) : (
                  <span aria-hidden="true" className="size-10 flex-none" />
                )
              )}
              <Button
                variant="secondary"
                size="icon"
                className="text-brand"
                title={exporting ? 'Exportando…' : 'Exportar CSV'}
                aria-label={`Exportar ${dataset.name} en CSV`}
                aria-busy={exporting}
                disabled={exporting}
                onClick={() => onExport(dataset)}
              >
                <EpenIcon name="download" />
              </Button>
            </div>
          </article>
        );
      })}

      {!datasets.length && <p className="py-6 text-center text-sm text-muted">No hay versiones que coincidan con los filtros.</p>}
    </div>
  );
}
