import EpenIcon from './EpenIcon';
const formatDate = value => new Intl.DateTimeFormat('es-PE', {dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
export default function DatasetHistoryTable({datasets,activeId,admin,saving,exportingId,onActivate,onExport}) {
 return <div className="epen-datasets-table-wrap" role="region" aria-label="Historial de bases, tabla desplazable" tabIndex={0}><table className="epen-datasets-table">
 <thead><tr>{['Base / encuesta','Periodo','Archivo','Fecha','Registros','Estado','Acciones'].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead>
 <tbody>{datasets.map(dataset=>{
 const active=dataset.id===activeId;
 const processing=dataset.status==='staging',failed=dataset.status==='failed';
 return <tr key={dataset.id} className={active?'epen-dataset-active':undefined}>
 <td><strong>{dataset.name}</strong>{dataset.synthetic && <small className="epen-synthetic-label">SINTÉTICA</small>}</td>
 <td>{dataset.period}</td><td className="epen-dataset-file"><EpenIcon name="filetype-csv"/><span>{dataset.fileName}</span></td>
 <td>{formatDate(dataset.importedAt)}<small>Importada por {dataset.importedBy}</small></td><td>{dataset.records}</td>
 <td><span className={'access-state '+(active?'access-state--active':failed?'access-state--error':'')}>{active?'En uso':processing?'Procesando':failed?'Falló':'Anterior'}</span></td>
 <td><div className="dataset-card__actions">{!active && !processing && !failed && admin && <button className="button button--secondary" type="button" disabled={saving} onClick={()=>onActivate(dataset.id)}>Usar base</button>}<button className="button button--secondary" type="button" disabled={exportingId===dataset.id} onClick={()=>onExport(dataset)}><EpenIcon name="download"/>{exportingId===dataset.id?'Exportando…':'Exportar CSV'}</button></div></td>
 </tr>;})}{!datasets.length && <tr><td colSpan={7} className="empty-state">No hay versiones que coincidan con los filtros.</td></tr>}</tbody>
 </table></div>;
}
