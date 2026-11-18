// Botón común. Variantes: principal, secundaria, discreta y peligrosa.
// Tamaños: md (por defecto), sm (acciones dentro de tablas y tarjetas) e icon (solo icono).
// Siempre tiene foco visible y estado deshabilitado. buttonClass da el mismo aspecto a un enlace.
const base = 'inline-flex items-center justify-center gap-2 rounded-[9px] border font-semibold no-underline transition enabled:hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-wait disabled:opacity-60';

const variants = {
  primary: 'border-transparent bg-brand text-white enabled:hover:bg-brand-strong',
  secondary: 'border-[#b9c8cf] bg-white text-navy enabled:hover:bg-brand-soft',
  quiet: 'border-transparent bg-transparent text-muted enabled:hover:bg-brand-soft',
  danger: 'border-[#efc8c4] bg-danger-soft text-danger enabled:hover:bg-[#fbd9d4]',
};

const sizes = {
  md: 'min-h-10 px-4 py-2 text-sm',
  sm: 'min-h-9 px-3 py-1.5 text-sm',
  icon: 'size-10 p-0 text-sm',
};

export function buttonClass({ variant = 'primary', size = 'md', block = false, className = '' } = {}) {
  return [base, variants[variant], sizes[size], block ? 'w-full' : '', className].join(' ');
}

export default function Button({ variant = 'primary', size = 'md', block = false, className = '', type = 'button', ...props }) {
  return <button type={type} className={buttonClass({ variant, size, block, className })} {...props} />;
}
