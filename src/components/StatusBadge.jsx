const labels = {
  pendiente: 'Pendiente', confirmado: 'Confirmado', corregido: 'Corregido', revision: 'Revisión humana',
};

export default function StatusBadge({ status }) {
  return <span className={`status status--${status}`}>{labels[status] || status}</span>;
}
