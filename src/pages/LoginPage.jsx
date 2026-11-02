import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';

export default function LoginPage() {
  const { user, login, authMode, loading: sessionLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState(authMode === 'real' ? '' : 'analista');
  const [password, setPassword] = useState(authMode === 'real' ? '' : 'demo2026');
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
          <p>Acceso local para revisar candidatos CIIU, consultar Qwen3 y registrar decisiones trazables.</p>
        </div>
        <form onSubmit={submit} className="login-form">
          <div className="demo-notice"><strong>{authMode === 'real' ? 'Acceso protegido' : 'Modo demostración'}</strong><span>{authMode === 'real' ? 'La identidad y los permisos se validan en el backend PostgreSQL.' : 'Utiliza datos sintéticos. No ingresar información real de la EPEN.'}</span></div>
          <label>Usuario<input autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} /></label>
          <label>Clave<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button--primary button--block" type="submit" disabled={submitting || sessionLoading}>{submitting ? 'Validando…' : 'Ingresar'}</button>
          <p className="login-help">{authMode === 'real' ? 'Usa la credencial asignada por el administrador.' : 'Usuarios: analista, supervisor, auditor o admin. Clave: demo2026.'}</p>
        </form>
      </section>
    </main>
  );
}
