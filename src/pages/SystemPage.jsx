import { useState } from 'react';
import { getR3Health } from '../services/dataClient';

export default function SystemPage() {
  const [health, setHealth] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  async function check() {
    setChecking(true); setError('');
    try { setHealth(await getR3Health()); }
    catch (err) { setHealth(null); setError(err.message || 'No se pudo comprobar la capa R3.'); }
    finally { setChecking(false); }
  }

  return (
    <div className="page">
      <div className="page-heading"><div><p className="eyebrow">Administración técnica</p><h1>Estado del sistema</h1><p>Comprueba la capa R3 sin exponer Ollama directamente al navegador.</p></div></div>
      <div className="system-grid">
        <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Configuración activa</p><h2>Entorno local</h2></div></div><dl className="system-list"><div><dt>Datos y acceso</dt><dd>PostgreSQL</dd></div><div><dt>Consultas Qwen</dt><dd>{health?.mode || 'por verificar'}</dd></div><div><dt>API R3 interna</dt><dd>Solo mediante backend</dd></div><div><dt>Backend seguro</dt><dd>127.0.0.1:8080</dd></div></dl></section>
        <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Comprobación en vivo</p><h2>Motor R3</h2></div><button type="button" className="button button--secondary" disabled={checking} onClick={check}>{checking ? 'Comprobando…' : 'Comprobar ahora'}</button></div>{health && <div className="notice notice--success" role="status"><strong>{health.estado === 'ok' ? 'Operativo' : 'Degradado'}</strong><span>{health.ollama} · {health.modelo}</span></div>}{error && <div className="notice notice--error" role="alert">{error}</div>}{!health && !error && <p className="empty-state empty-state--compact">Todavía no se ejecutó la comprobación.</p>}</section>
      </div>
    </div>
  );
}
