import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import CasesPage from './pages/CasesPage';
import CaseDetailPage from './pages/CaseDetailPage';
import ReviewPage from './pages/ReviewPage';
import HistoryPage from './pages/HistoryPage';
import MetricsPage from './pages/MetricsPage';
import SystemPage from './pages/SystemPage';
import UsersPage from './pages/UsersPage';
import DatasetsPage from './pages/DatasetsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route element={<ProtectedRoute roles={['analista', 'supervisor', 'admin']} />}>
            <Route path="casos" element={<CasesPage />} />
            <Route path="casos/:id" element={<CaseDetailPage />} />
          </Route>
          <Route element={<ProtectedRoute roles={['supervisor', 'admin']} />}>
            <Route path="revision" element={<ReviewPage />} />
          </Route>
          <Route element={<ProtectedRoute roles={['supervisor', 'auditor', 'admin']} />}>
            <Route path="historial" element={<HistoryPage />} />
            <Route path="metricas" element={<MetricsPage />} />
          </Route>
          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="bases" element={<DatasetsPage />} />
            <Route path="usuarios" element={<UsersPage />} />
            <Route path="sistema" element={<SystemPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
