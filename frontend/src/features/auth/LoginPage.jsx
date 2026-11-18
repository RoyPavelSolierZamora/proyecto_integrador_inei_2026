import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/state/AuthContext.jsx';

export default function LoginPage() {
  const { user, login, loading: sessionLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!sessionLoading && user) return <Navigate to="/" replace />;

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true); setError('');
    const result = await login(username, password);
    setSubmitting(false);
    if (!result.ok) setError(result.error);
    else navigate(location.state?.from || '/', { replace: true });
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-intro">
          <span className="brand-mark brand-mark--large">EPEN</span>
          <p className="eyebrow">Proyecto Integrador PEU-CD</p>
          <h1 id="login-title">Codificación asistida de actividades económicas</h1>
          <p>Acceso local para revisar candidatos CIIU, consultar la asistencia de IA y registrar decisiones trazables.</p>
          <div className="login-facts" aria-label="Características del sistema"><div><strong>417</strong><span>clases CIIU</span></div><div><strong>Auditable</strong><span>cada decisión</span></div><div><strong>Por roles</strong><span>cada acceso</span></div></div>
        </div>
        <form onSubmit={submit} className="login-form">
          <div className="access-notice"><strong>Acceso protegido</strong><span>Ingresa con la cuenta asignada por el administrador.</span></div>
          <label>Usuario<input autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} /></label>
          <label>Clave<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button--primary button--block" type="submit" disabled={submitting || sessionLoading}>{submitting ? 'Validando…' : 'Ingresar'}</button>
          <p className="login-help">Usa la credencial asignada por el administrador.</p>
        </form>
      </section>
    </main>
  );
}
