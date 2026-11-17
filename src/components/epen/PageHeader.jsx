import EpenIcon from './EpenIcon';

/**
 * Cabecera común de todas las páginas del dashboard.
 * Mantiene el mismo orden: icono, etiqueta corta, título, descripción y acciones.
 */
export default function PageHeader({ icon, title, description, meta, actions, headingId }) {
  return (
    <header className={`page-heading${icon ? ' page-heading--with-icon' : ''}`}>
      <div className="page-heading__lead">
        {icon && <span className="epen-heading-icon" aria-hidden="true"><EpenIcon name={icon} /></span>}
        <div className="page-heading__text">
          <h1 id={headingId}>{title}</h1>
          {description && <p>{description}</p>}
          {meta && <small>{meta}</small>}
        </div>
      </div>
      {actions && <div className="page-heading__actions">{actions}</div>}
    </header>
  );
}
