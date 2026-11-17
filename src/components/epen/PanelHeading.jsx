import EpenIcon from './EpenIcon';

/**
 * Cabecera común de paneles y secciones.
 * Todo bloque principal muestra la misma jerarquía: etiqueta, título,
 * descripción opcional y acciones a la derecha.
 */
export default function PanelHeading({ icon, title, description, actions, compact = false }) {
  const content = (
    <div>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
  return (
    <div className={`panel-heading${compact ? ' panel-heading--compact' : ''}`}>
      {icon ? <div className="epen-card-title"><EpenIcon name={icon} />{content}</div> : content}
      {actions && <div className="panel-heading__actions">{actions}</div>}
    </div>
  );
}
