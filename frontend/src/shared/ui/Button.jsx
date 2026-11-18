// Botón común. Las variantes son las acciones que usa la aplicación: principal,
// secundaria, discreta y peligrosa. Siempre tiene foco visible y estado deshabilitado.
// buttonClass permite dar el mismo aspecto a un enlace (<Link>) sin duplicar estilos.
const base = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-[9px] border px-4 py-2 text-sm font-semibold no-underline transition enabled:hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-wait disabled:opacity-60';

const variants = {
  primary: 'border-transparent bg-brand text-white enabled:hover:bg-brand-strong',
  secondary: 'border-[#b9c8cf] bg-white text-navy enabled:hover:bg-brand-soft',
  quiet: 'border-transparent bg-transparent text-muted enabled:hover:bg-brand-soft',
  danger: 'border-[#efc8c4] bg-danger-soft text-danger enabled:hover:bg-[#fbd9d4]',
};

export function buttonClass({ variant = 'primary', block = false, className = '' } = {}) {
  return [base, variants[variant], block ? 'w-full' : '', className].join(' ');
}

export default function Button({ variant = 'primary', block = false, className = '', type = 'button', ...props }) {
  return <button type={type} className={buttonClass({ variant, block, className })} {...props} />;
}
