import EpenIcon from './EpenIcon.jsx';

// Encabezado de un bloque o panel: título, descripción opcional y acciones a la derecha.
export default function PanelHeading({ icon, title, description, actions }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <span aria-hidden="true" className="mt-0.5 text-brand"><EpenIcon name={icon} /></span>}
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-ink-strong">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
