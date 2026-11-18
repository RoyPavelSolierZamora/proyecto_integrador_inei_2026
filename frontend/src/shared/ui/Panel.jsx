// Superficie común para agrupar contenido. Une bordes, radio y sombra en un solo lugar.
export default function Panel({ as: Tag = 'section', className = '', ...props }) {
  return <Tag className={['rounded-2xl border border-line bg-surface shadow-sm', className].join(' ')} {...props} />;
}
