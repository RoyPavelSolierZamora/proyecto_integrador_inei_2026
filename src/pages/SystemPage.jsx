import { useState } from 'react';
import PageHeader from '../components/epen/PageHeader';
import PanelHeading from '../components/epen/PanelHeading';
import { getR3Health } from '../services/dataClient';

export default function SystemPage() {
  const [health, setHealth] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const executionLabel = health?.execution === 'remote' ? 'Colab / GPU remota' : health?.execution === 'local' ? 'Equipo local' : 'Por verificar';

  async function check() {
    setChecking(true); setError('');
    try { setHealth(await getR3Health()); }
    catch (err) { setHealth(null); setError(err.message || 'No se pudo comprobar el servicio de IA.'); }
    finally { setChecking(false); }
  }

  return (
    <div className="page">
      <PageHeader
        icon="gear"
        eyebrow="Administración técnica"
        title="Estado del sistema"
        description="Comprueba el asistente de IA sin exponer servicios internos al navegador."
      />
      <div className="system-grid">
        <section className="panel">
          <PanelHeading eyebrow="Configuración activa" title="Entorno de procesamiento" />
          <dl className="system-list">
            <div><dt>Datos y acceso</dt><dd>PostgreSQL local</dd></div>
            <div><dt>Asistente de IA</dt><dd>{executionLabel}</dd></div>
            <div><dt>Acceso a la IA</dt><dd>Solo mediante el sistema autenticado</dd></div>
            <div><dt>Backend seguro</dt><dd>127.0.0.1:8080</dd></div>
          </dl>
        </section>
        <section className="panel">
          <PanelHeading
            eyebrow="Comprobación en vivo"
            title="Asistente de IA"
            actions={<button type="button" className="button button--secondary" disabled={checking} onClick={check}>{checking ? 'Comprobando…' : 'Comprobar ahora'}</button>}
          />
          {health && <div className="notice notice--success" role="status"><strong>{health.estado === 'ok' ? 'Operativo' : 'Degradado'} · {executionLabel}</strong><span>{health.ollama} · {health.modelo}{health.gpu ? ` · ${health.gpu}` : ''}</span></div>}
          {error && <div className="notice notice--error" role="alert">{error}</div>}
          {!health && !error && <p className="empty-state empty-state--compact">Todavía no se ejecutó la comprobación.</p>}
        </section>
      </div>
    </div>
  );
}
