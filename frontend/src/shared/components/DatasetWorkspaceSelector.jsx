import { useEffect, useMemo, useRef, useState } from 'react';

const INITIAL_LIMIT = 12;
const LIMIT_STEP = 20;

export default function DatasetWorkspaceSelector({ datasets, selectedId, onChange, noun = 'revisar' }) {
  const root = useRef(null);
  const searchInput = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(INITIAL_LIMIT);
  const available = useMemo(() => datasets
    .filter(item => ['active', 'archived'].includes(item.status))
    .sort((left, right) => Number(right.active) - Number(left.active)
      || new Date(right.importedAt) - new Date(left.importedAt)), [datasets]);
  const selected = available.find(item => String(item.id) === String(selectedId));
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => available.filter(item => {
    const text = `${item.name} ${item.period} ${item.version} ${item.fileName}`.toLowerCase();
    return !normalizedQuery || text.includes(normalizedQuery);
  }), [available, normalizedQuery]);
  const visible = filtered.slice(0, limit);

  useEffect(() => {
    const closeOutside = event => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    const closeEscape = event => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, []);

  useEffect(() => {
    if (open) requestAnimationFrame(() => searchInput.current?.focus());
    else {
      setQuery('');
      setLimit(INITIAL_LIMIT);
    }
  }, [open]);

  const choose = item => {
    onChange(item.id);
    setOpen(false);
  };

  return (
    <section className="workspace-selector" aria-label="Base de datos seleccionada">
      <div className="workspace-picker" ref={root}>
        <span className="workspace-picker__label">Base de datos a {noun}</span>
        <button className="workspace-picker__trigger" type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(value => !value)}>
          <span>{selected ? `${selected.name} · ${selected.period} · v${selected.version}` : 'Seleccionar base de datos'}</span>
          <span className="workspace-picker__chevron" aria-hidden="true">⌄</span>
        </button>
        {open && <div className="workspace-picker__menu">
          <label className="workspace-picker__search">Buscar base<input ref={searchInput} type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(INITIAL_LIMIT); }} placeholder="Nombre, periodo o archivo" /></label>
          <div className="workspace-picker__options" role="listbox" aria-label="Bases disponibles">
            {visible.map(item => <button key={item.id} type="button" role="option" aria-selected={String(item.id) === String(selected?.id)} className={String(item.id) === String(selected?.id) ? 'workspace-picker__option workspace-picker__option--selected' : 'workspace-picker__option'} onClick={() => choose(item)}>
              <span><strong>{item.name}</strong><small>{item.period} · v{item.version} · {item.records} registros</small></span>
              {item.active && <em>Activa</em>}
            </button>)}
            {!visible.length && <p className="workspace-picker__empty">No se encontraron bases.</p>}
          </div>
          {visible.length < filtered.length && <button className="workspace-picker__more" type="button" onClick={() => setLimit(value => value + LIMIT_STEP)}>Mostrar {Math.min(LIMIT_STEP, filtered.length - visible.length)} más</button>}
          <small className="workspace-picker__total">{filtered.length} base{filtered.length === 1 ? '' : 's'} disponible{filtered.length === 1 ? '' : 's'}</small>
        </div>}
      </div>
      <div className="workspace-selector__summary">
        <strong>{selected?.name || 'Sin base seleccionada'}</strong>
        <span>{selected ? `${selected.records} registros · ${selected.fileName}` : 'Procesa una base para comenzar.'}</span>
      </div>
    </section>
  );
}
