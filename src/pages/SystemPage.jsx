import { useState } from 'react';
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
      <div className="page-heading"><div><p className="eyebrow">Administración técnica</p><h1>Estado del sistema</h1><p>Comprueba el asistente de IA sin exponer servicios internos al navegador.</p></div></div>
      <div className="system-grid">
        <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Configuración activa</p><h2>Entorno de procesamiento</h2></div></div><dl className="system-list"><div><dt>Datos y acceso</dt><dd>PostgreSQL local</dd></div><div><dt>Asistente de IA</dt><dd>{executionLabel}</dd></div><div><dt>Acceso a la IA</dt><dd>Solo mediante el sistema autenticado</dd></div><div><dt>Backend seguro</dt><dd>127.0.0.1:8080</dd></div></dl></section>
        <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Comprobación en vivo</p><h2>Asistente de IA</h2></div><button type="button" className="button button--secondary" disabled={checking} onClick={check}>{checking ? 'Comprobando…' : 'Comprobar ahora'}</button></div>{health && <div className="notice notice--success" role="status"><strong>{health.estado === 'ok' ? 'Operativo' : 'Degradado'} · {executionLabel}</strong><span>{health.ollama} · {health.modelo}{health.gpu ? ` · ${health.gpu}` : ''}</span></div>}{error && <div className="notice notice--error" role="alert">{error}</div>}{!health && !error && <p className="empty-state empty-state--compact">Todavía no se ejecutó la comprobación.</p>}</section>
      </div>
    </div>
  );
}
