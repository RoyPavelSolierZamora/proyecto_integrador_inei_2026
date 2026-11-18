import EpenIcon from '../ui/EpenIcon.jsx';

const formatDate = value => new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export default function DatasetHistoryTable({ datasets, activeId, admin, saving, exportingId, onActivate, onExport }) {
  return <div className="dataset-history" role="list" aria-label="Historial de bases">
    <div className="dataset-history__head" aria-hidden="true"><span>Base</span><span>Periodo</span><span>Importación</span><span>Registros</span><span>Estado</span><span>Acciones</span></div>
    {datasets.map(dataset => {
        const active = dataset.id === activeId;
        const processing = dataset.status === 'staging', failed = dataset.status === 'failed', cancelled = dataset.status === 'cancelled';
        return <article role="listitem" key={dataset.id} className={`dataset-history__row${active ? ' epen-dataset-active' : ''}`}>
          <div className="dataset-history__base" data-label="Base">
            <strong title={dataset.name}>{dataset.name}</strong>
            <small className="epen-dataset-file"><EpenIcon name="filetype-csv" /><span>{dataset.fileName}</span></small>
          </div>
          <div data-label="Periodo"><span>{dataset.period || 'Sin periodo'}</span></div>
          <div data-label="Importación"><span>{formatDate(dataset.importedAt)}</span><small>Por {dataset.importedBy}</small></div>
          <div data-label="Registros"><span>{Number(dataset.records || 0).toLocaleString('es-PE')}</span></div>
          <div data-label="Estado"><span className={'access-state ' + (active ? 'access-state--active' : failed ? 'access-state--error' : '')}>{active ? 'En uso' : processing ? 'Procesando' : cancelled ? 'Cancelada' : failed ? 'Falló' : 'Anterior'}</span></div>
          <div data-label="Acciones" className="table-action-cell">
            <div className="dataset-card__actions">
              {!active && !processing && !failed && !cancelled && admin && <button className="button button--secondary button--icon" type="button" title="Usar esta base" aria-label={`Usar la base ${dataset.name}`} disabled={saving} onClick={() => onActivate(dataset.id)}><EpenIcon name="check-circle" /></button>}
              <button className="button button--secondary button--icon" type="button" title={exportingId === dataset.id ? 'Exportando…' : 'Exportar CSV'} aria-label={`Exportar ${dataset.name} en CSV`} aria-busy={exportingId === dataset.id} disabled={exportingId === dataset.id} onClick={() => onExport(dataset)}><EpenIcon name="download" /></button>
            </div>
          </div>
        </article>;
      })}
    {!datasets.length && <p className="empty-state">No hay versiones que coincidan con los filtros.</p>}
  </div>;
}
