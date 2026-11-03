# -*- coding: utf-8 -*-
"""
db.py
Persistencia local en SQLite para trazabilidad y auditoria de las codificaciones.

Esta base es el PUNTO DE UNION entre los tres componentes del proyecto:
  - R3 (LLM)   escribe aqui sus decisiones.
  - R4 (dashboard) lee de aqui; NO necesita saber como funciona el LLM.
  - R2 (ML)    usa la columna `origen` y las revisiones humanas como datos etiquetados
               para reentrenar (lazo de mejora).

Tablas:
  catalogo_ciiu  -> codigo, descripcion                     (417 clases oficiales)
  codificaciones -> una fila por registro procesado         (entrada + decision + auditoria)

Columnas clave para el dashboard:
  id_registro : llave de union con la base EPEN original
  run_id      : identifica la corrida (permite comparar versiones del modelo)
  decision    : lo que dijo el LLM ('seleccionar' | 'revision_humana')
  codigo_final: el codigo que QUEDA asignado (LLM o humano)
  origen      : quien decidio el codigo_final ('llm' | 'humano' | 'ml')
  requiere_revision : 1 = esta en la cola del analista
"""
import os
import sqlite3
from datetime import datetime

BASE = os.path.dirname(os.path.abspath(__file__))
SALIDAS = os.path.join(BASE, "salidas")
DB = os.path.join(SALIDAS, "epen_codificacion.db")

DDL = """
CREATE TABLE IF NOT EXISTS catalogo_ciiu (
    codigo TEXT PRIMARY KEY,
    descripcion TEXT
);

CREATE TABLE IF NOT EXISTS codificaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_registro TEXT,
    run_id TEXT,
    p309 TEXT,
    candidatos TEXT,
    confianza_ml REAL,
    codigo_real TEXT,
    decision TEXT,
    codigo_llm TEXT,
    codigo_final TEXT,
    origen TEXT,
    confianza REAL,
    justificacion TEXT,
    latencia_s REAL,
    modelo TEXT,
    requiere_revision INTEGER,
    motivo TEXT,
    analista TEXT,
    fecha TEXT,
    fecha_revision TEXT
);
"""

# Los indices se crean DESPUES de migrar: una base antigua aun no tiene esas columnas.
INDICES = [
    "CREATE INDEX IF NOT EXISTS idx_cod_run ON codificaciones(run_id)",
    "CREATE INDEX IF NOT EXISTS idx_cod_rev ON codificaciones(requiere_revision)",
    "CREATE INDEX IF NOT EXISTS idx_cod_reg ON codificaciones(id_registro)",
]

# Columnas agregadas despues de la primera version (migracion de bases existentes)
COLUMNAS_NUEVAS = {
    "id_registro": "TEXT",
    "run_id": "TEXT",
    "confianza_ml": "REAL",
    "codigo_final": "TEXT",
    "origen": "TEXT",
    "motivo": "TEXT",
    "analista": "TEXT",
    "fecha_revision": "TEXT",
}


def conectar(ruta=DB, check_same_thread=True):
    """
    check_same_thread=False es necesario para el servicio HTTP, que atiende cada
    peticion en un hilo distinto. En ese caso, serializar los accesos con un Lock.
    """
    os.makedirs(os.path.dirname(os.path.abspath(ruta)), exist_ok=True)
    conn = sqlite3.connect(ruta, check_same_thread=check_same_thread)
    conn.executescript(DDL)
    _migrar(conn)
    for sql in INDICES:
        conn.execute(sql)
    conn.commit()
    return conn


def _migrar(conn):
    """Agrega columnas faltantes a bases creadas con versiones anteriores."""
    existentes = {r[1] for r in conn.execute("PRAGMA table_info(codificaciones)")}
    for col, tipo in COLUMNAS_NUEVAS.items():
        if col not in existentes:
            conn.execute(f"ALTER TABLE codificaciones ADD COLUMN {col} {tipo}")
    # Filas antiguas: se marcan como corrida heredada para poder filtrarlas
    conn.execute("UPDATE codificaciones SET run_id='legacy' WHERE run_id IS NULL")
    conn.commit()


def cargar_catalogo(conn, catalogo):
    conn.executemany(
        "INSERT OR REPLACE INTO catalogo_ciiu (codigo, descripcion) VALUES (?, ?)",
        list(catalogo.items()),
    )
    conn.commit()


def guardar_salida(conn, salida, entrada=None):
    """
    Inserta una salida del contrato (ver contrato.py) mas los datos de entrada.
    `entrada` es la entrada normalizada; si falta, solo se guarda la salida.
    """
    entrada = entrada or {}
    cands = entrada.get("candidatos") or []
    conn.execute(
        """INSERT INTO codificaciones
           (id_registro, run_id, p309, candidatos, confianza_ml, codigo_real,
            decision, codigo_llm, codigo_final, origen, confianza, justificacion,
            latencia_s, modelo, requiere_revision, motivo, fecha)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            salida.get("id_registro"),
            salida.get("run_id"),
            entrada.get("p309"),
            ";".join(f"{c['codigo']}:{c.get('descripcion','')}" for c in cands),
            entrada.get("confianza_ml"),
            salida.get("codigo_real"),
            salida.get("decision"),
            salida.get("codigo"),
            salida.get("codigo") or None,
            salida.get("origen"),
            salida.get("confianza_llm"),
            salida.get("justificacion"),
            salida.get("latencia_s"),
            salida.get("modelo"),
            salida.get("requiere_revision"),
            salida.get("motivo") or "",
            datetime.now().isoformat(timespec="seconds"),
        ),
    )
    conn.commit()


def pendientes(conn, run_id=None, limite=None):
    """Cola de revision humana: lo que el dashboard debe mostrar al analista."""
    q = """SELECT id, id_registro, p309, candidatos, codigo_llm, justificacion, motivo, run_id
           FROM codificaciones WHERE requiere_revision = 1
             AND (codigo_final IS NULL OR origen != 'humano')"""
    params = []
    if run_id:
        q += " AND run_id = ?"
        params.append(run_id)
    q += " ORDER BY id"
    if limite:
        q += f" LIMIT {int(limite)}"
    return conn.execute(q, params).fetchall()


def recientes(conn, limite=20, run_id=None):
    """Ultimas decisiones, en orden inverso. Es lo que muestra el panel."""
    q = """SELECT id, id_registro, p309, codigo_llm, codigo_final, origen,
                  requiere_revision, latencia_s, fecha
           FROM codificaciones"""
    params = []
    if run_id:
        q += " WHERE run_id = ?"
        params.append(run_id)
    q += " ORDER BY id DESC LIMIT ?"
    params.append(int(limite))
    cur = conn.execute(q, params)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, fila)) for fila in cur]


def revisar(conn, id_fila, codigo, analista="analista"):
    """
    Registra la decision HUMANA sobre un caso derivado. Escribe codigo_final,
    cambia el origen a 'humano' y saca la fila de la cola de revision.
    Este codigo queda disponible como dato etiquetado para R2.
    """
    codigo = str(codigo).strip()
    if not (len(codigo) == 4 and codigo.isdigit()):
        raise ValueError(f"codigo CIIU invalido: {codigo!r}")
    cur = conn.execute(
        """UPDATE codificaciones
           SET codigo_final = ?, origen = 'humano', requiere_revision = 0,
               analista = ?, fecha_revision = ?
           WHERE id = ?""",
        (codigo, analista, datetime.now().isoformat(timespec="seconds"), int(id_fila)),
    )
    conn.commit()
    if cur.rowcount == 0:
        raise KeyError(f"no existe la fila id={id_fila}")


def metricas(conn, run_id=None):
    """
    Metricas del sistema hibrido, listas para el dashboard.
    Devuelve un dict con exactitud, cobertura, derivacion y latencia.
    """
    cond = ["1 = 1"]
    params = []
    if run_id:
        cond.append("run_id = ?")
        params.append(run_id)
    filtro = " AND ".join(cond)

    def contar(extra=""):
        q = f"SELECT COUNT(*) FROM codificaciones WHERE {filtro} {extra}"
        return conn.execute(q, params).fetchone()[0]

    total = contar()
    if not total:
        return {"total": 0}

    auto = contar("AND origen = 'llm'")
    humano = contar("AND origen = 'humano'")
    pendientes_n = contar("AND requiere_revision = 1")
    lat = conn.execute(
        f"SELECT AVG(latencia_s), MIN(latencia_s), MAX(latencia_s) "
        f"FROM codificaciones WHERE {filtro} AND latencia_s IS NOT NULL",
        params,
    ).fetchone()

    return {
        "run_id": run_id,
        "total": total,
        "automaticos": auto,
        "humanos": humano,
        "pendientes": pendientes_n,
        "cobertura_pct": round(100 * auto / total, 1),
        "derivacion_pct": round(100 * pendientes_n / total, 1),
        "latencia_media_s": round(lat[0] or 0, 2),
        "latencia_min_s": round(lat[1] or 0, 2),
        "latencia_max_s": round(lat[2] or 0, 2),
    }
