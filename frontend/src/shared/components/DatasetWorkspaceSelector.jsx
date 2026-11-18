import { useEffect, useMemo, useRef, useState } from 'react';

const INITIAL_LIMIT = 12;
const LIMIT_STEP = 20;

// Selector de la base de trabajo. Carga por bloques para no saturar la pantalla
// cuando hay muchas versiones; la lista se cierra con clic fuera o con Escape.
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
    <section aria-label="Base de datos seleccionada" className="grid grid-cols-1 gap-3 rounded-2xl border border-line bg-surface p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-center">
      <div ref={root} className="relative grid gap-1.5">
        <span className="text-sm font-semibold text-ink">Base de datos a {noun}</span>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen(value => !value)}
          className="flex min-h-11 items-center justify-between gap-3 rounded-[9px] border border-[#b9c8cf] bg-white px-3 text-left text-sm text-ink-strong hover:border-brand"
        >
          <span className="truncate">{selected ? `${selected.name} · ${selected.period} · v${selected.version}` : 'Seleccionar base de datos'}</span>
          <span aria-hidden="true" className="text-muted">⌄</span>
        </button>

        {open && (
          <div className="absolute inset-x-0 top-full z-30 mt-2 grid gap-2 rounded-xl border border-line bg-surface p-3 shadow-lg">
            <label className="grid grid-cols-1 gap-1 text-sm font-semibold text-ink">
              Buscar base
              <input
                ref={searchInput}
                type="search"
                value={query}
                onChange={event => { setQuery(event.target.value); setLimit(INITIAL_LIMIT); }}
                placeholder="Nombre, periodo o archivo"
                className="min-h-10 rounded-[9px] border border-[#b9c8cf] px-3 text-sm font-normal"
              />
            </label>
            <div role="listbox" aria-label="Bases disponibles" className="grid max-h-72 gap-1 overflow-y-auto">
              {visible.map(item => {
                const isSelected = String(item.id) === String(selected?.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => choose(item)}
                    className={['flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left', isSelected ? 'bg-brand-soft' : 'hover:bg-[#f5f8fd]'].join(' ')}
                  >
                    <span className="grid min-w-0">
                      <strong className="truncate text-sm text-ink-strong">{item.name}</strong>
                      <small className="text-xs text-muted">{item.period} · v{item.version} · {item.records} registros</small>
                    </span>
                    {item.active && <em className="rounded-full bg-[#e4f7ec] px-2 py-0.5 text-xs font-semibold not-italic text-[#05603a]">Activa</em>}
                  </button>
                );
              })}
              {!visible.length && <p className="py-4 text-center text-sm text-muted">No se encontraron bases.</p>}
            </div>
            {visible.length < filtered.length && (
              <button type="button" className="text-sm font-semibold text-brand hover:underline" onClick={() => setLimit(value => value + LIMIT_STEP)}>
                Mostrar {Math.min(LIMIT_STEP, filtered.length - visible.length)} más
              </button>
            )}
            <small className="text-xs text-muted">{filtered.length} base{filtered.length === 1 ? '' : 's'} disponible{filtered.length === 1 ? '' : 's'}</small>
          </div>
        )}
      </div>

      <div className="grid min-w-0 gap-0.5">
        <strong className="truncate text-ink-strong">{selected?.name || 'Sin base seleccionada'}</strong>
        <span className="text-sm text-muted">{selected ? `${selected.records} registros · ${selected.fileName}` : 'Procesa una base para comenzar.'}</span>
      </div>
    </section>
  );
}
