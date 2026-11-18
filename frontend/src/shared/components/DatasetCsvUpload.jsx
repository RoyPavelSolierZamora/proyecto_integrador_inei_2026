import { useState } from 'react';
import EpenIcon from '../ui/EpenIcon.jsx';
import Button from '../ui/Button.jsx';

// Zona para subir el CSV original: arrastrar o examinar, con especificaciones y resumen del archivo.
export default function DatasetCsvUpload({ file, disabled, reading, onSelect, onRemove, inputRef }) {
  const [dragging, setDragging] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  return (
    <div className="grid grid-cols-1 gap-3">
      <div
        aria-label="Soltar CSV original"
        onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={event => { event.preventDefault(); setDragging(false); if (!disabled) onSelect(event.dataTransfer.files); }}
        className={[
          'grid justify-items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center',
          dragging ? 'border-brand bg-brand-soft' : 'border-[#b9c8cf] bg-[#f8fbff]',
        ].join(' ')}
      >
        <span className="text-brand"><EpenIcon name="cloud-arrow-up" /></span>
        <strong className="text-ink-strong">Arrastra tu archivo CSV original aquí</strong>
        <span className="text-sm text-muted">Soporta archivos de hasta 25 MB · Columnas requeridas: id_registro, p309</span>
        <Button variant="secondary" disabled={disabled} onClick={() => inputRef.current.click()}>
          <EpenIcon name="folder2-open" />
          {file ? 'Sustituir archivo' : 'Examinar archivos'}
        </Button>
        <input
          ref={inputRef}
          hidden
          type="file"
          accept=".csv,text/csv"
          aria-label="CSV original"
          disabled={disabled}
          onChange={event => onSelect(event.target.files)}
        />
      </div>

      <div>
        <button type="button" className="text-sm font-semibold text-brand hover:underline" onClick={() => setShowGuide(open => !open)}>
          {showGuide ? 'Ocultar especificaciones del formato' : 'Ver especificaciones del formato CSV'}
        </button>
      </div>

      {showGuide && (
        <div className="grid grid-cols-1 gap-2 rounded-lg border border-line bg-[#f8fbff] p-4 text-sm leading-relaxed text-muted">
          <p><strong className="text-ink-strong">Obligatorias:</strong> <code>id_registro</code> (o <code>id_c200</code>) y <code>p309</code> (o <code>c309</code>). Identificadores únicos y texto abierto.</p>
          <p><strong className="text-ink-strong">Opcionales:</strong> <code>p308</code>, <code>p308a</code>, <code>c309_1</code>, <code>c310</code>, <code>c311</code> y <code>c366</code> (hasta 160 caracteres).</p>
        </div>
      )}

      {file && (
        <div className="flex items-center gap-3 rounded-lg border border-brand-soft bg-brand-soft/50 p-3">
          <span className="text-brand"><EpenIcon name="filetype-csv" /></span>
          <div className="min-w-0 flex-1">
            <strong className="block truncate text-sm text-ink-strong">{file.name}</strong>
            <span className="text-xs text-muted">{(file.size / 1024 / 1024).toLocaleString('es-PE', { maximumFractionDigits: 2 })} MB · {file.size.toLocaleString('es-PE')} bytes</span>
          </div>
          <Button variant="secondary" disabled={disabled} aria-label="Quitar CSV original" onClick={onRemove} size="sm">
            <EpenIcon name="trash" />
          </Button>
        </div>
      )}

      {reading && <p role="status" className="text-sm text-muted">Validando estructura del archivo…</p>}
    </div>
  );
}
