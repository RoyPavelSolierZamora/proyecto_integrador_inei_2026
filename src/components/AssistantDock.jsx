import { useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import AssistantWorkspace from './AssistantWorkspace';
import EpenIcon from './epen/EpenIcon';

export default function AssistantDock() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const params = useParams();
  if (location.pathname === '/asistente') return null;
  const caseExternalId = location.pathname.startsWith('/casos/') ? params.id || decodeURIComponent(location.pathname.split('/').pop()) : null;
  return <><button className="assistant-launcher" type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={open ? 'Cerrar asistente EPEN' : 'Abrir asistente EPEN'} title="Ayuda y análisis" onClick={() => setOpen(value => !value)}><span aria-hidden="true"><EpenIcon name={open ? 'x-lg' : 'chat-dots'} /></span><strong>{open ? 'Cerrar' : 'Ayuda y análisis'}</strong></button>{open && <div className="assistant-drawer" role="dialog" aria-modal="false" aria-label="Asistente EPEN"><AssistantWorkspace compact caseExternalId={caseExternalId} onClose={() => setOpen(false)} /></div>}</>;
}
