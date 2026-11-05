import { useState } from 'react';
import EpenIcon from './EpenIcon';
export default function DatasetCsvUpload({file,disabled,reading,onSelect,onRemove,inputRef}) {
 const [dragging,setDragging]=useState(false);
 return <div className="epen-upload-area">
 <div className={'epen-dropzone'+(dragging?' epen-dropzone--dragging':'')} onDragOver={event=>{event.preventDefault();if(!disabled)setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);if(!disabled)onSelect(event.dataTransfer.files);}} aria-label="Soltar CSV original">
 <EpenIcon name="cloud-arrow-up"/><strong>Arrastra y suelta tu CSV original</strong><span>Máximo 25 MB · Se utiliza la validación original de EPEN</span>
 <button type="button" className="button button--secondary" disabled={disabled} onClick={()=>inputRef.current.click()}><EpenIcon name="folder2-open"/>{file?'Sustituir archivo':'Seleccionar archivo'}</button>
 <input ref={inputRef} hidden type="file" accept=".csv,text/csv" aria-label="CSV original" disabled={disabled} onChange={event=>onSelect(event.target.files)}/>
 </div>
 {file && <div className="epen-selected-file"><EpenIcon name="filetype-csv"/><div><strong>{file.name}</strong><span>{(file.size/1024/1024).toLocaleString('es-PE',{maximumFractionDigits:2})} MB · {file.size.toLocaleString('es-PE')} bytes</span></div><button type="button" className="button button--secondary" disabled={disabled} aria-label="Quitar CSV original" onClick={onRemove}><EpenIcon name="trash"/></button></div>}
 {reading && <p role="status" className="helper-text">Validando archivo…</p>}
 </div>;
}
