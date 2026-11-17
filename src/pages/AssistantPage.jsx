import { useLocation } from 'react-router-dom';
import AssistantWorkspace from '../components/AssistantWorkspace';

export default function AssistantPage() {
  const location = useLocation();
  const caseExternalId = new URLSearchParams(location.search).get('case');
  return <div className="page assistant-page"><div className="page-heading"><div><p className="eyebrow">Consultas autorizadas</p><h1>Análisis asistido</h1><p>Consulta el uso del sistema, resume bases, compara periodos y recupera antecedentes. Los cálculos provienen del backend y respetan tu rol.</p></div></div><AssistantWorkspace caseExternalId={caseExternalId} /></div>;
}
