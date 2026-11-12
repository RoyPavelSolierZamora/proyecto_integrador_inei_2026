import { useState } from 'react';
import EpenIcon from './EpenIcon';
import ContextHelp from '../ContextHelp';
export default function DatasetCsvUpload({file,disabled,reading,onSelect,onRemove,inputRef}) {
 const [dragging,setDragging]=useState(false);
 return <div className="epen-upload-area">
 <div className={'epen-dropzone'+(dragging?' epen-dropzone--dragging':'')} onDragOver={event=>{event.preventDefault();if(!disabled)setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);if(!disabled)onSelect(event.dataTransfer.files);}} aria-label="Soltar CSV original">
 <EpenIcon name="cloud-arrow-up"/><strong>Arrastra y suelta tu CSV original</strong><span>Máximo 25 MB · Hasta 50 000 registros</span>
 <button type="button" className="button button--secondary" disabled={disabled} onClick={()=>inputRef.current.click()}><EpenIcon name="folder2-open"/>{file?'Sustituir archivo':'Seleccionar archivo'}</button>
 <input ref={inputRef} hidden type="file" accept=".csv,text/csv" aria-label="CSV original" disabled={disabled} onChange={event=>onSelect(event.target.files)}/>
 </div>
 <ContextHelp title="¿Qué archivo debo cargar?">
   <p>Selecciona un CSV. La plantilla disponible en esta sección muestra el formato.</p>
   <p><strong>Columnas obligatorias:</strong> id_registro (o id_c200) y p309 (o c309). Cada identificador debe ser único, estar completo y tener hasta 120 caracteres. Las respuestas p309 vacías se envían a revisión.</p>
   <p><strong>Opcionales:</strong> p308 (o c308), p308a (o c308a), c310, c311 y c366. Estas tres últimas admiten hasta 160 caracteres cada una. Puedes separar las columnas con coma o punto y coma.</p>
 </ContextHelp>
 {file && <div className="epen-selected-file"><EpenIcon name="filetype-csv"/><div><strong>{file.name}</strong><span>{(file.size/1024/1024).toLocaleString('es-PE',{maximumFractionDigits:2})} MB · {file.size.toLocaleString('es-PE')} bytes</span></div><button type="button" className="button button--secondary" disabled={disabled} aria-label="Quitar CSV original" onClick={onRemove}><EpenIcon name="trash"/></button></div>}
 {reading && <p role="status" className="helper-text">Validando archivo…</p>}
 </div>;
}
