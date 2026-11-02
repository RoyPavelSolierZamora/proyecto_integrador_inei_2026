import { Link } from 'react-router-dom';
import { useData } from '../state/DataContext';

export default function ReviewPage() {
  const { cases } = useData();
  const reviewCases = cases.filter(item => item.estado === 'revision');
  return (
    <div className="page">
      <div className="page-heading"><div><p className="eyebrow">Supervisión</p><h1>Revisión humana</h1><p>Casos derivados por ambigüedad, error o convención institucional.</p></div></div>
      <div className="record-list">{reviewCases.map(item => <article className="record-row" key={item.id_registro}><div><strong>{item.id_registro}</strong><p>{item.p309}</p><small>{item.qwen?.justificacion || 'Sin consulta Qwen registrada.'}</small></div><div className="record-meta"><span>{Math.round(item.confianza_ml * 100)} % R2</span><Link className="button button--primary" to={`/casos/${item.id_registro}`}>Resolver</Link></div></article>)}{!reviewCases.length && <p className="empty-state">No hay casos pendientes de revisión humana.</p>}</div>
    </div>
  );
}
