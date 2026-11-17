import { useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import AssistantWorkspace from './AssistantWorkspace';

export default function AssistantDock() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const params = useParams();
  if (location.pathname === '/asistente') return null;
  const caseExternalId = location.pathname.startsWith('/casos/') ? params.id || decodeURIComponent(location.pathname.split('/').pop()) : null;
  return <><button className="assistant-launcher" type="button" aria-haspopup="dialog" aria-expanded={open} aria-label="Asistente EPEN" title="Asistente EPEN" onClick={() => setOpen(value => !value)}><span aria-hidden="true">IA</span><strong>Asistente</strong></button>{open && <div className="assistant-drawer" role="dialog" aria-modal="false" aria-label="Asistente EPEN"><AssistantWorkspace compact caseExternalId={caseExternalId} onClose={() => setOpen(false)} /></div>}</>;
}
