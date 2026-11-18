import EpenIcon from './EpenIcon.jsx';

// Encabezado de cada pantalla: icono, título, descripción y acciones.
// Se apila en móvil y se separa en escritorio; las acciones nunca se salen de la pantalla.
export default function PageHeader({ icon, title, description, meta, actions }) {
  return (
    <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        {icon && (
          <span aria-hidden="true" className="grid size-14 flex-none place-items-center rounded-xl bg-brand-soft text-brand">
            <EpenIcon name={icon} />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-ink-strong md:text-3xl">{title}</h1>
          {description && <p className="mt-1 text-[15px] leading-relaxed text-muted">{description}</p>}
          {meta && <small className="mt-1 block text-sm text-muted">{meta}</small>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2 md:flex-none">{actions}</div>}
    </header>
  );
}
