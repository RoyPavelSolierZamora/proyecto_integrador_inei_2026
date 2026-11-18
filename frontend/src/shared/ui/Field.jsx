// Campo de formulario: etiqueta visible asociada al control por id, y ayuda opcional debajo.
// El control (input, select o textarea) se pasa como hijo y debe recibir el mismo id
// y, si hay ayuda, aria-describedby={`${id}-ayuda`}.
export default function Field({ id, label, hint, children, className = '' }) {
  return (
    <div className={['grid content-start gap-1.5', className].join(' ')}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">{label}</label>
      {children}
      {hint && <small id={id ? `${id}-ayuda` : undefined} className="text-xs text-muted">{hint}</small>}
    </div>
  );
}

export const inputClass = 'min-h-11 w-full rounded-[9px] border border-[#b9c8cf] bg-white px-3 py-2 text-base font-normal text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand disabled:opacity-60';
