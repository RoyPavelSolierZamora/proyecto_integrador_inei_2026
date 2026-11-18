import { useState } from 'react';
import EpenIcon from '../ui/EpenIcon.jsx';

export default function DatasetCsvUpload({ file, disabled, reading, onSelect, onRemove, inputRef }) {
  const [dragging, setDragging] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  return (
    <div className="epen-upload-area">
      <div
        className={'epen-dropzone' + (dragging ? ' epen-dropzone--dragging' : '')}
        onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={event => { event.preventDefault(); setDragging(false); if (!disabled) onSelect(event.dataTransfer.files); }}
        aria-label="Soltar CSV original"
      >
        <EpenIcon name="cloud-arrow-up" />
        <strong>Arrastra tu archivo CSV original aquí</strong>
        <span>Soporta archivos de hasta 25 MB · Columnas requeridas: id_registro, p309</span>
        <button
          type="button"
          className="button button--secondary"
          disabled={disabled}
          onClick={() => inputRef.current.click()}
        >
          <EpenIcon name="folder2-open" />
          {file ? 'Sustituir archivo' : 'Examinar archivos'}
        </button>
        <input
          ref={inputRef}
          hidden
          type="file"
          accept=".csv,text/csv"
          aria-label="CSV original"
          disabled={disabled}
          onChange={event => selectFiles(event.target.files)}
        />
      </div>

      <div className="upload-meta-bar">
        <button
          type="button"
          className="text-link"
          onClick={() => setShowGuide(g => !g)}
        >
          {showGuide ? 'Ocultar especificaciones del formato' : 'Ver especificaciones del formato CSV'}
        </button>
      </div>

      {showGuide && (
        <div className="upload-format-guide">
          <p><strong>Obligatorias:</strong> <code>id_registro</code> (o <code>id_c200</code>) y <code>p309</code> (o <code>c309</code>). Identificadores únicos y texto abierto.</p>
          <p><strong>Opcionales:</strong> <code>p308</code>, <code>p308a</code>, <code>c309_1</code>, <code>c310</code>, <code>c311</code> y <code>c366</code> (hasta 160 caracteres).</p>
        </div>
      )}

      {file && (
        <div className="epen-selected-file">
          <EpenIcon name="filetype-csv" />
          <div>
            <strong>{file.name}</strong>
            <span>{(file.size / 1024 / 1024).toLocaleString('es-PE', { maximumFractionDigits: 2 })} MB · {file.size.toLocaleString('es-PE')} bytes</span>
          </div>
          <button
            type="button"
            className="button button--secondary"
            disabled={disabled}
            aria-label="Quitar CSV original"
            onClick={onRemove}
          >
            <EpenIcon name="trash" />
          </button>
        </div>
      )}

      {reading && <p role="status" className="helper-text">Validando estructura del archivo…</p>}
    </div>
  );

  function selectFiles(files) {
    onSelect(files);
  }
}
