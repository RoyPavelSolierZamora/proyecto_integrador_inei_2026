import EpenIcon from './EpenIcon.jsx';

// Encabezado de un bloque o panel: icono en una ficha de color, título, descripción y acciones.
export default function PanelHeading({ icon, title, description, actions }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span aria-hidden="true" className="grid size-10 flex-none place-items-center rounded-xl bg-brand-soft text-brand">
            <EpenIcon name={icon} />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-tight text-ink-strong">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
