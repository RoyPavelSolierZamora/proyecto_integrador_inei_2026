// Mensaje de estado. Usa role="alert" para errores y role="status" para el resto,
// de modo que los lectores de pantalla lo anuncien según su gravedad.
const tones = {
  info: 'border-brand-soft bg-brand-soft/60 text-ink',
  success: 'border-[#b7e4c7] bg-[#ecfdf3] text-[#05603a]',
  error: 'border-[#efc8c4] bg-danger-soft text-danger',
};

export default function Notice({ tone = 'info', title, children, actions }) {
  const role = tone === 'error' ? 'alert' : 'status';
  return (
    <div role={role} className={['grid gap-1.5 rounded-xl border p-4 text-sm', tones[tone]].join(' ')}>
      {title && <strong className="font-semibold text-ink-strong">{title}</strong>}
      {children && <span>{children}</span>}
      {actions && <div className="mt-2 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
