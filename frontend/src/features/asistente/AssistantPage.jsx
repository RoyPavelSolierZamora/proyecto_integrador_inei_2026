import { useLocation } from 'react-router-dom';
import AssistantWorkspace from './AssistantWorkspace.jsx';
import PageHeader from '../../shared/ui/PageHeader.jsx';

export default function AssistantPage() {
  const location = useLocation();
  const caseExternalId = new URLSearchParams(location.search).get('case');

  return (
    <div className="grid grid-cols-1 gap-4">
      <PageHeader
        dense
        icon="layers"
        title="Asistente de análisis"
        description="Consulta una base, compara periodos o pide ayuda para completar una tarea."
      />
      <AssistantWorkspace caseExternalId={caseExternalId} />
    </div>
  );
}
