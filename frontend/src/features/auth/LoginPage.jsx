import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/state/AuthContext.jsx';
import Button from '../../shared/ui/Button.jsx';
import Field, { inputClass } from '../../shared/ui/Field.jsx';
import Panel from '../../shared/ui/Panel.jsx';

const facts = [
  { value: '417', label: 'clases CIIU' },
  { value: 'Auditable', label: 'cada decisión' },
  { value: 'Por roles', label: 'cada acceso' },
];

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
    setSubmitting(true);
    setError('');
    const result = await login(username, password);
    setSubmitting(false);
    if (!result.ok) setError(result.error);
    else navigate(location.state?.from || '/', { replace: true });
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[linear-gradient(135deg,#0b2b43_0_42%,#e9f2f4_42%_100%)] p-6">
      <Panel className="grid w-full max-w-[940px] overflow-hidden rounded-[22px] md:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col justify-center gap-4 bg-navy p-9 text-white md:p-14">
          <span className="w-fit rounded-md bg-white/15 px-3 py-1 text-sm font-bold tracking-wide">EPEN</span>
          <p className="text-sm font-semibold text-[#dbefff]">Proyecto Integrador PEU-CD</p>
          <h1 className="max-w-[520px] text-3xl font-bold leading-tight tracking-tight text-white">
            Codificación asistida de actividades económicas
          </h1>
          <p className="max-w-[520px] leading-relaxed text-[#d4e1e8]">
            Acceso local para revisar candidatos CIIU, consultar la asistencia de IA y registrar decisiones trazables.
          </p>
          <dl className="mt-7 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-white/20" aria-label="Características del sistema">
            {facts.map(fact => (
              <div key={fact.label} className="grid grid-cols-1 gap-1 bg-[rgba(10,37,58,0.72)] p-3">
                <dt className="m-0 text-xs text-[#d4e1e8]">{fact.label}</dt>
                <dd className="m-0 text-sm font-bold text-white">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <form onSubmit={submit} className="grid content-center gap-4 p-8 md:p-10">
          <div className="grid grid-cols-1 gap-1 rounded-xl border border-brand-soft bg-brand-soft/60 p-4 text-sm text-ink">
            <strong className="text-ink-strong">Acceso protegido</strong>
            <span className="text-muted">Ingresa con la cuenta asignada por el administrador.</span>
          </div>
          <Field id="login-usuario" label="Usuario">
            <input id="login-usuario" className={inputClass} autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} />
          </Field>
          <Field id="login-clave" label="Clave">
            <input id="login-clave" className={inputClass} type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} />
          </Field>
          {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
          <Button type="submit" block disabled={submitting || sessionLoading}>
            {submitting ? 'Validando…' : 'Ingresar'}
          </Button>
          <p className="text-center text-xs text-muted">Usa la credencial asignada por el administrador.</p>
        </form>
      </Panel>
    </main>
  );
}
