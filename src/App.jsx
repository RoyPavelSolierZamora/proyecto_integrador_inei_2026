import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import CasesPage from './pages/CasesPage';
import CaseDetailPage from './pages/CaseDetailPage';
import HistoryPage from './pages/HistoryPage';
import MetricsPage from './pages/MetricsPage';
import SystemPage from './pages/SystemPage';
import UsersPage from './pages/UsersPage';
import DatasetsPage from './pages/DatasetsPage';
import QualityPage from './pages/QualityPage';
import CriteriaPage from './pages/CriteriaPage';
import AssistantPage from './pages/AssistantPage';

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
            <Route path="calidad" element={<QualityPage />} />
            <Route path="criterios" element={<CriteriaPage />} />
          </Route>
          <Route path="asistente" element={<AssistantPage />} />
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
