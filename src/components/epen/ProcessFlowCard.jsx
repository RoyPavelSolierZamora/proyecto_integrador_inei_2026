import { Fragment } from 'react';
import EpenIcon from './EpenIcon';
const steps = [
 ['cloud-arrow-up','Cargar CSV original','Selecciona la base y revisa las observaciones de validación.'],
 ['file-earmark-code','Ejecutar clasificación automática','El servicio procesa los registros por lotes con el nivel de seguridad indicado.'],
 ['clipboard-check','Derivar casos difíciles','Asistencia de IA automática o consulta manual, según la modalidad elegida.'],
 ['layers','Consultar versiones','Registra resultados y conserva las bases anteriores para trazabilidad.'],
];
export default function ProcessFlowCard(){return <aside className="panel epen-process-flow" aria-labelledby="epen-flow-title">
 <div className="epen-card-title"><EpenIcon name="layers"/><div><h2 id="epen-flow-title">Flujo del proceso</h2><p>Del CSV original a los resultados registrados.</p></div></div>
 <ol>{steps.map(([icon,title,text],index)=><Fragment key={title}><li><span className="epen-step-number">{index+1}</span><EpenIcon name={icon}/><div><strong>{title}</strong><p>{text}</p></div></li>{index<steps.length-1 && <li className="epen-flow-arrow" aria-hidden="true"><EpenIcon name="arrow-down"/></li>}</Fragment>)}</ol>
 </aside>;}
