import EpenIcon from '../ui/EpenIcon.jsx';
import Button from '../ui/Button.jsx';

const formatDate = value => new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

// Estado de una versión: en uso, procesando, cancelada, fallida o anterior.
function stateOf(dataset, active) {
  if (active) return { label: 'En uso', tone: 'bg-[#e4f7ec] text-[#05603a]' };
  if (dataset.status === 'staging') return { label: 'Procesando', tone: 'bg-brand-soft text-navy' };
  if (dataset.status === 'cancelled') return { label: 'Cancelada', tone: 'bg-line text-muted' };
  if (dataset.status === 'failed') return { label: 'Falló', tone: 'bg-danger-soft text-danger' };
  return { label: 'Anterior', tone: 'bg-line text-muted' };
}

// En escritorio es una tabla con columnas; en móvil cada versión se convierte en una ficha.
const cell = 'grid gap-0.5 text-sm md:block md:py-3 md:pr-3';
const mobileLabel = 'text-xs font-semibold text-muted md:hidden';

export default function DatasetHistoryTable({ datasets, activeId, admin, saving, exportingId, onActivate, onExport }) {
  return (
    <div role="list" aria-label="Historial de bases" className="grid grid-cols-1 gap-3 md:gap-0">
      <div aria-hidden="true" className="hidden grid-cols-[2fr_1fr_1.4fr_0.8fr_1fr_auto] gap-3 border-b border-line pb-2 text-xs font-semibold text-muted md:grid">
        <span>Base</span><span>Periodo</span><span>Importación</span><span>Registros</span><span>Estado</span><span>Acciones</span>
      </div>
      {datasets.map(dataset => {
        const active = dataset.id === activeId;
        const state = stateOf(dataset, active);
        const canActivate = !active && dataset.status !== 'staging' && dataset.status !== 'failed' && dataset.status !== 'cancelled' && admin;
        return (
          <article
            key={dataset.id}
            role="listitem"
            className={[
              'grid gap-3 rounded-xl border p-4 md:grid-cols-[2fr_1fr_1.4fr_0.8fr_1fr_auto] md:items-center md:gap-3 md:rounded-none md:border-x-0 md:border-t md:border-b-0 md:p-0 md:border-line',
              active ? 'border-brand bg-brand-soft/40 md:bg-brand-soft/40' : 'border-line bg-surface',
            ].join(' ')}
          >
            <div className={cell}>
              <strong title={dataset.name} className="truncate text-ink-strong">{dataset.name}</strong>
              <small className="flex items-center gap-1 truncate text-xs text-muted"><EpenIcon name="filetype-csv" /><span className="truncate">{dataset.fileName}</span></small>
            </div>
            <div className={cell}><span className={mobileLabel}>Periodo</span><span>{dataset.period || 'Sin periodo'}</span></div>
            <div className={cell}>
              <span className={mobileLabel}>Importación</span>
              <span>{formatDate(dataset.importedAt)}</span>
              <small className="text-xs text-muted">Por {dataset.importedBy}</small>
            </div>
            <div className={cell}><span className={mobileLabel}>Registros</span><span>{Number(dataset.records || 0).toLocaleString('es-PE')}</span></div>
            <div className={cell}>
              <span className={mobileLabel}>Estado</span>
              <span className={['w-fit rounded-full px-2.5 py-1 text-xs font-semibold', state.tone].join(' ')}>{state.label}</span>
            </div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              {canActivate && (
                <Button variant="secondary" size="icon" title="Usar esta base" aria-label={`Usar la base ${dataset.name}`} disabled={saving} onClick={() => onActivate(dataset.id)}>
                  <EpenIcon name="check-circle" />
                </Button>
              )}
              <Button
                variant="secondary"
                size="icon"
                title={exportingId === dataset.id ? 'Exportando…' : 'Exportar CSV'}
                aria-label={`Exportar ${dataset.name} en CSV`}
                aria-busy={exportingId === dataset.id}
                disabled={exportingId === dataset.id}
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
