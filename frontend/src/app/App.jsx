import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AppShell from './AppShell.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';
import LoginPage from '../features/auth/LoginPage.jsx';
import HomePage from '../features/inicio/HomePage.jsx';
import CasesPage from '../features/casos/CasesPage.jsx';
import CaseDetailPage from '../features/casos/CaseDetailPage.jsx';
import HistoryPage from '../features/auditoria/HistoryPage.jsx';
import MetricsPage from '../features/metricas/MetricsPage.jsx';
import SystemPage from '../features/sistema/SystemPage.jsx';
import UsersPage from '../features/usuarios/UsersPage.jsx';
import DatasetsPage from '../features/bases/DatasetsPage.jsx';
function QualityRedirect(){const location=useLocation();const params=new URLSearchParams(location.search);params.set('vista','resumen');return <Navigate to={'/metricas?'+params.toString()} replace/>;}
import CalidadCodificacionPage from '../features/calidad-codificacion/CalidadCodificacionPage.jsx';
import MisLotesPage from '../features/mis-lotes/MisLotesPage.jsx';
import CriteriaPage from '../features/criterios/CriteriaPage.jsx';
import AssistantPage from '../features/asistente/AssistantPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route element={<ProtectedRoute roles={['analista', 'supervisor', 'auditor', 'admin']} />}>
            <Route path="casos" element={<CasesPage />} />
            <Route path="casos/:id" element={<CaseDetailPage />} />
            <Route path="revision" element={<Navigate to="/casos" replace />} />
          </Route>
          <Route element={<ProtectedRoute roles={['supervisor', 'auditor', 'admin']} />}>
            <Route path="historial" element={<HistoryPage />} />
            <Route path="metricas" element={<MetricsPage />} />
            <Route path="calidad" element={<QualityRedirect />} />
            <Route path="calidad-codificacion" element={<CalidadCodificacionPage />} />
            <Route path="criterios" element={<CriteriaPage />} />
          </Route>
          <Route path="asistente" element={<AssistantPage />} />
          <Route element={<ProtectedRoute roles={['analista', 'supervisor', 'admin']} />}>
            <Route path="mis-lotes" element={<MisLotesPage />} />
            <Route path="mis-lotes/:lote" element={<MisLotesPage />} />
          </Route>
          <Route element={<ProtectedRoute roles={['operador', 'admin']} />}>
            <Route path="bases" element={<DatasetsPage />} />
          </Route>
          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="usuarios" element={<UsersPage />} />
            <Route path="sistema" element={<SystemPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
