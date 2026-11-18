import { useRef } from 'react';

// Ayuda desplegable nativa: funciona con mouse, teclado y táctil sin tapar los controles.
// Escape cierra la ayuda y devuelve el foco al resumen.
export default function ContextHelp({ title, children }) {
  const disclosure = useRef(null);
  return (
    <details
      ref={disclosure}
      className="group mb-4 rounded-lg border border-line bg-[#f8fbff] px-4 py-2.5 text-sm text-ink"
      onKeyDown={event => {
        if (event.key === 'Escape' && disclosure.current.open) {
          event.stopPropagation();
          disclosure.current.open = false;
          disclosure.current.querySelector('summary').focus();
        }
      }}
    >
      <summary className="cursor-pointer font-semibold text-brand">{title}</summary>
      <div className="mt-2 grid gap-2 leading-relaxed text-muted">{children}</div>
    </details>
  );
}
