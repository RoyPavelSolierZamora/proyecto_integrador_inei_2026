import { useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import AssistantWorkspace from './AssistantWorkspace.jsx';
import EpenIcon from '../../shared/ui/EpenIcon.jsx';

// Acceso flotante al asistente. En pantallas angostas muestra solo el icono para no tapar acciones.
export default function AssistantDock() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const params = useParams();
  if (location.pathname === '/asistente') return null;
  const caseExternalId = location.pathname.startsWith('/casos/')
    ? params.id || decodeURIComponent(location.pathname.split('/').pop())
    : null;

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={open ? 'Cerrar asistente EPEN' : 'Abrir asistente EPEN'}
        title="Ayuda y análisis"
        onClick={() => setOpen(value => !value)}
        className="fixed bottom-4 right-4 z-40 inline-flex min-h-11 items-center gap-2 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <EpenIcon name={open ? 'x-lg' : 'chat-dots'} />
        <span className="hidden sm:inline">{open ? 'Cerrar' : 'Ayuda y análisis'}</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Asistente EPEN"
          className="fixed bottom-20 right-4 z-40 w-[min(420px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-line shadow-2xl"
        >
          <AssistantWorkspace compact caseExternalId={caseExternalId} onClose={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}
