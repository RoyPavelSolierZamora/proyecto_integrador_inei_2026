// Estado de un caso. Cada estado tiene un color y una etiqueta fija en español.
const styles = {
  pendiente: 'bg-[#fff4d6] text-[#7a4b00]',
  confirmado: 'bg-[#e4f7ec] text-[#05603a]',
  corregido: 'bg-brand-soft text-navy',
  revision: 'bg-danger-soft text-danger',
};
const labels = {
  pendiente: 'Pendiente', confirmado: 'Confirmado', corregido: 'Corregido', revision: 'Revisión humana',
};

export default function StatusBadge({ status }) {
  return (
    <span className={['inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', styles[status] || 'bg-line text-muted'].join(' ')}>
      {labels[status] || status}
    </span>
  );
}
