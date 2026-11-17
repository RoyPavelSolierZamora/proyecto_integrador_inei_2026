import { useLocation } from 'react-router-dom';
import AssistantWorkspace from '../components/AssistantWorkspace';
import PageHeader from '../components/epen/PageHeader';

export default function AssistantPage() {
  const location = useLocation();
  const caseExternalId = new URLSearchParams(location.search).get('case');
  return (
    <div className="page assistant-page">
      <PageHeader
        icon="layers"
        title="Asistente de análisis"
        description="Consulta una base, compara periodos o pide ayuda para completar una tarea."
      />
      <AssistantWorkspace caseExternalId={caseExternalId} />
    </div>
  );
}
