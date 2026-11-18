import Panel from './Panel.jsx';

// Indicador numérico con etiqueta y nota opcional. Se usa en resúmenes de cada pantalla.
export default function Stat({ label, value, hint }) {
  return (
    <Panel className="grid content-start gap-1 p-5">
      <span className="text-sm font-semibold text-muted">{label}</span>
      <strong className="text-3xl font-bold text-ink-strong">{value}</strong>
      {hint && <small className="text-xs text-muted">{hint}</small>}
    </Panel>
  );
}
