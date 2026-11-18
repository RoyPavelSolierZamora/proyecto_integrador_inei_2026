import { useState } from 'react';
import PageHeader from '../../shared/ui/PageHeader.jsx';
import PanelHeading from '../../shared/ui/PanelHeading.jsx';
import Panel from '../../shared/ui/Panel.jsx';
import Button from '../../shared/ui/Button.jsx';
import Notice from '../../shared/ui/Notice.jsx';
import { getR3Health } from '../../shared/api/dataClient.js';

export default function SystemPage() {
  const [health, setHealth] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const executionLabel = health?.execution === 'remote' ? 'Colab / GPU remota' : health?.execution === 'local' ? 'Equipo local' : 'Por verificar';

  async function check() {
    setChecking(true);
    setError('');
    try {
      setHealth(await getR3Health());
    } catch (err) {
      setHealth(null);
      setError(err.message || 'No se pudo comprobar el servicio de IA.');
    } finally {
      setChecking(false);
    }
  }

  const settings = [
    ['Datos y acceso', 'PostgreSQL local'],
    ['Asistente de IA', executionLabel],
    ['Acceso a la IA', 'Solo mediante el sistema autenticado'],
    ['Backend seguro', '127.0.0.1:8080'],
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        icon="gear"
        title="Estado del sistema"
        description="Comprueba el asistente de IA sin exponer servicios internos al navegador."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-5">
          <PanelHeading title="Entorno de procesamiento" />
          <dl className="divide-y divide-line">
            {settings.map(([term, value]) => (
              <div key={term} className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]">
                <dt className="text-sm font-semibold text-muted">{term}</dt>
                <dd className="m-0 text-sm text-ink-strong">{value}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel className="grid content-start gap-4 p-5">
          <PanelHeading
            title="Asistente de IA"
            description="Verifica si el servicio responde y qué equipo lo ejecuta."
            actions={<Button variant="secondary" disabled={checking} onClick={check}>{checking ? 'Comprobando…' : 'Comprobar ahora'}</Button>}
          />
          {health && (
            <Notice tone="success" title={`${health.estado === 'ok' ? 'Operativo' : 'Degradado'} · ${executionLabel}`}>
              {`${health.ollama} · ${health.modelo}${health.gpu ? ` · ${health.gpu}` : ''}`}
            </Notice>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          {!health && !error && <p className="text-sm text-muted">Todavía no se ejecutó la comprobación.</p>}
        </Panel>
      </div>
    </div>
  );
}
