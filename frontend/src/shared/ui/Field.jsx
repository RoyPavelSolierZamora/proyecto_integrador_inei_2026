// Campo de formulario con etiqueta visible. El control se pasa como hijo para que
// cualquier input, select o textarea mantenga el mismo aspecto y espaciado.
export default function Field({ label, children, className = '' }) {
  return (
    <label className={['grid gap-1.5 text-sm font-semibold text-ink', className].join(' ')}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export const inputClass = 'min-h-11 rounded-[9px] border border-[#b9c8cf] bg-white px-3 py-2 text-base font-normal text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand';
