import { useState } from 'react';
import { authMode } from '../services/authClient';
import { getR3Health } from '../services/dataClient';
import { runtimeConfig } from '../services/r3Client';
import { useData } from '../state/DataContext';

export default function SystemPage() {
  const { resetDemo, real } = useData();
  const [health, setHealth] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  async function check() {
    setChecking(true); setError('');
    try { setHealth(await getR3Health()); }
    catch (err) { setHealth(null); setError(err.message || 'No se pudo comprobar la capa R3.'); }
    finally { setChecking(false); }
  }

  function reset() {
    if (window.confirm('¿Restablecer todos los casos y eventos sintéticos?')) resetDemo();
  }

  return (
    <div className="page">
      <div className="page-heading"><div><p className="eyebrow">Administración técnica</p><h1>Estado del sistema</h1><p>Comprueba la capa R3 sin exponer Ollama directamente al navegador.</p></div></div>
      <div className="system-grid">
        <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Configuración activa</p><h2>Entorno local</h2></div></div><dl className="system-list"><div><dt>Datos</dt><dd>{runtimeConfig.dataMode}</dd></div><div><dt>Acceso</dt><dd>{authMode === 'real' ? 'PostgreSQL' : 'Demostración local'}</dd></div><div><dt>Consultas Qwen</dt><dd>{health?.mode || 'por verificar'}</dd></div><div><dt>API R3 interna</dt><dd>Solo mediante backend</dd></div><div><dt>Backend seguro</dt><dd>127.0.0.1:8080</dd></div></dl></section>
        <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Comprobación en vivo</p><h2>Motor R3</h2></div><button type="button" className="button button--secondary" disabled={checking} onClick={check}>{checking ? 'Comprobando…' : 'Comprobar ahora'}</button></div>{health && <div className="notice notice--success" role="status"><strong>{health.estado === 'ok' ? 'Operativo' : 'Degradado'}</strong><span>{health.ollama} · {health.modelo}</span></div>}{error && <div className="notice notice--error" role="alert">{error}</div>}{!health && !error && <p className="empty-state empty-state--compact">Todavía no se ejecutó la comprobación.</p>}</section>
      </div>
      {!real && <section className="panel danger-zone"><div><p className="eyebrow">Datos sintéticos</p><h2>Restablecer demostración</h2><p>Elimina las decisiones locales de esta SPA y recupera los casos iniciales.</p></div><button type="button" className="button button--danger-quiet" onClick={reset}>Restablecer</button></section>}
    </div>
  );
}
