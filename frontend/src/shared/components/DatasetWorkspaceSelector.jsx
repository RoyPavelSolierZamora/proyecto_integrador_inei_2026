import { useEffect, useMemo, useState } from 'react';
import Button from '../ui/Button.jsx';
import Field, { inputClass } from '../ui/Field.jsx';

const INITIAL_LIMIT = 12;
const LIMIT_STEP = 20;

// Selector de la base de trabajo. Se abre como diálogo, con el mismo diseño del catálogo CIIU:
// buscador arriba, opciones con borde y un contador al pie. Carga por bloques para no saturar la pantalla.
export default function DatasetWorkspaceSelector({ datasets, selectedId, onChange, noun = 'revisar' }) {
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
    if (!open) {
      setQuery('');
      setLimit(INITIAL_LIMIT);
      return undefined;
    }
    const closeEscape = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', closeEscape);
    return () => document.removeEventListener('keydown', closeEscape);
  }, [open]);

  const choose = item => {
    onChange(item.id);
    setOpen(false);
  };

  return (
    <section aria-label="Base de datos seleccionada" className="grid grid-cols-1 gap-3 rounded-2xl border border-line bg-surface p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-center">
      <div className="grid gap-1.5">
        <span className="text-sm font-semibold text-ink">Base de datos a {noun}</span>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="flex min-h-11 items-center justify-between gap-3 rounded-[9px] border border-[#b9c8cf] bg-white px-3 text-left text-sm text-ink-strong hover:border-brand"
        >
          <span className="truncate">{selected ? `${selected.name} · ${selected.period} · v${selected.version}` : 'Seleccionar base de datos'}</span>
          <span aria-hidden="true" className="text-muted">⌄</span>
        </button>
      </div>

      <div className="grid min-w-0 gap-0.5">
        <strong className="truncate text-ink-strong">{selected?.name || 'Sin base seleccionada'}</strong>
        <span className="text-sm text-muted">{selected ? `${selected.records} registros · ${selected.fileName}` : 'Procesa una base para comenzar.'}</span>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-strong/40 p-3"
          onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="bases-titulo" className="flex max-h-[min(85vh,680px)] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl">
            <div className="grid shrink-0 content-start gap-4 p-6 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="grid grid-cols-1 gap-0.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand">Bases de datos</p>
                  <h2 id="bases-titulo" className="text-lg font-bold text-ink-strong">Seleccionar base de trabajo</h2>
                </div>
                <Button type="button" variant="quiet" size="sm" aria-label="Cerrar" onClick={() => setOpen(false)}>Cerrar</Button>
              </div>
              <Field id="bases-buscar" label="Buscar por nombre, periodo o archivo">
                <input
                  id="bases-buscar"
                  autoFocus
                  type="search"
                  className={inputClass}
                  value={query}
                  onChange={event => { setQuery(event.target.value); setLimit(INITIAL_LIMIT); }}
                  placeholder="Ej. prueba07 o 2026-09"
                />
              </Field>
            </div>

            <div role="listbox" aria-label="Bases disponibles" className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto px-6 py-2">
              {visible.map(item => {
                const isSelected = String(item.id) === String(selected?.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => choose(item)}
                    className={['grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition', isSelected ? 'border-2 border-brand bg-brand-soft' : 'border-[#c7d8ee] bg-white hover:border-brand hover:bg-brand-soft/40'].join(' ')}
                  >
                    <span className="grid min-w-0 gap-0.5">
                      <strong className="truncate text-ink-strong">{item.name}</strong>
                      <span className="truncate text-xs text-muted">{item.period} · v{item.version} · {item.records} registros · {item.fileName || 'sin archivo'}</span>
                    </span>
                    {item.active && <em className="rounded-full bg-[#e4f7ec] px-2.5 py-1 text-xs font-semibold not-italic text-[#05603a]">Activa</em>}
                  </button>
                );
              })}
              {!visible.length && <p className="py-6 text-center text-sm text-muted">No se encontraron bases con ese criterio.</p>}
            </div>

            <div aria-live="polite" className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-6 pb-4 pt-2 text-sm text-muted">
              <span>
                {visible.length < filtered.length
                  ? `${visible.length} de ${filtered.length} ${normalizedQuery ? 'coincidencias' : 'bases'}`
                  : `${filtered.length} ${normalizedQuery ? 'coincidencia' : 'base'}${filtered.length === 1 ? '' : 's'}${normalizedQuery ? '' : ' disponibles'}`}
              </span>
              {visible.length < filtered.length && (
                <Button variant="secondary" size="sm" onClick={() => setLimit(value => value + LIMIT_STEP)}>
                  Mostrar {Math.min(LIMIT_STEP, filtered.length - visible.length)} más
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
