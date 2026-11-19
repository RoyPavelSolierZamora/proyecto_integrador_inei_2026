import EpenIcon from './EpenIcon.jsx';

// Encabezado de cada pantalla: icono, título, descripción y acciones.
// Se apila en móvil y se separa en escritorio; las acciones nunca se salen de la pantalla.
// dense: versión compacta para pantallas que necesitan todo el alto (p. ej. el asistente).
export default function PageHeader({ icon, title, description, meta, actions, dense = true }) {
  return (
    <header className={['flex flex-col gap-4 md:flex-row md:items-center md:justify-between', dense ? 'mb-0' : 'mb-6'].join(' ')}>
      <div className="flex min-w-0 items-start gap-4">
        {icon && (
          <span aria-hidden="true" className={['grid flex-none place-items-center rounded-xl bg-brand-soft text-brand', dense ? 'size-10' : 'size-14'].join(' ')}>
            <EpenIcon name={icon} />
          </span>
        )}
        <div className="min-w-0">
          <h1 className={['font-bold tracking-tight text-ink-strong', dense ? 'text-xl md:text-2xl' : 'text-2xl md:text-3xl'].join(' ')}>{title}</h1>
          {description && <p className={['text-muted', dense ? 'mt-0.5 text-sm' : 'mt-1 text-[15px] leading-relaxed'].join(' ')}>{description}</p>}
          {meta && <small className="mt-1 block text-sm text-muted">{meta}</small>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2 md:flex-none">{actions}</div>}
    </header>
  );
}
