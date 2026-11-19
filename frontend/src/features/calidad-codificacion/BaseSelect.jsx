import { useEffect, useRef, useState } from 'react';

// Desplegable de bases con buscador. La lista tiene altura fija y se desplaza dentro del propio menú,
// así que aunque haya muchas bases no se hace larga la página.
export default function BaseSelect({ label, bases, value, onChange, allLabel }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef(null);
  const selected = bases.find(item => String(item.id) === String(value)) || null;
  const term = query.trim().toLowerCase();
  const shown = bases.filter(item => `${item.name} ${item.period}`.toLowerCase().includes(term));

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    const closeEscape = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [open]);

  function pick(id) {
    onChange(id);
    setOpen(false);
    setQuery('');
  }

  const optionClass = active => [
    'flex w-full items-center justify-between gap-3 rounded-lg border-0 bg-transparent px-3 py-2 text-left text-sm',
    active ? '!bg-brand-soft font-semibold text-brand' : 'text-ink hover:bg-[#f5f8fd]',
  ].join(' ');

  return (
    <div ref={root} className="relative grid min-w-0 gap-1.5">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
        className="flex min-h-11 items-center justify-between gap-3 rounded-[9px] border border-[#b9c8cf] bg-white px-3 text-left text-sm text-ink-strong hover:border-brand"
      >
        <span className="truncate">
          {selected ? `${selected.name} · ${selected.period}` : allLabel || 'Elegir base'}
        </span>
        <span aria-hidden="true" className="text-muted">⌄</span>
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 grid gap-2 rounded-xl border border-line bg-surface p-2 shadow-lg">
          <input
            autoFocus
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Buscar por nombre o periodo"
            aria-label="Buscar base"
            className="min-h-10 rounded-lg border border-[#b9c8cf] bg-white px-3 text-sm text-ink-strong"
          />
          <ul role="listbox" aria-label={label} className="grid max-h-64 gap-0.5 overflow-y-auto overscroll-contain pr-1">
            {allLabel && !term && (
              <li>
                <button type="button" role="option" aria-selected={!value} onClick={() => pick('')} className={optionClass(!value)}>
                  {allLabel}
                </button>
              </li>
            )}
            {shown.map((item, index) => {
              const active = String(item.id) === String(value);
              return (
                <li key={item.id}>
                  <button type="button" role="option" aria-selected={active} onClick={() => pick(String(item.id))} className={optionClass(active)}>
                    <span className="min-w-0 truncate">{item.name} · {item.period}</span>
                    {index === 0 && !term && <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">Más reciente</span>}
                  </button>
                </li>
              );
            })}
            {!shown.length && <li className="px-3 py-2 text-sm text-muted">No hay bases con ese nombre.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
