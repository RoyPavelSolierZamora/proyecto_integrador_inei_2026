# Instrucciones para integrar el motor R2 con el dashboard EPEN

## Objetivo

El motor R2 clasifica el texto abierto `P309` mediante estadística o ML clásico. Debe devolver
entre uno y cinco candidatos CIIU Rev.4, una probabilidad por candidato y una confianza máxima.
El dashboard aplica el umbral operativo y envía a Qwen únicamente los casos difíciles. En cada
carga, el operador elige si esos casos pasan a una cola manual o si Qwen los procesa en segundo
plano automáticamente.

No agregues lógica del modelo dentro del frontend React ni escribas directamente en PostgreSQL.
Tu componente debe ser un servicio HTTP interno sustituible.

## Servicio que debes entregar

El dashboard espera por defecto el servicio en `http://127.0.0.1:8100`. La dirección se puede
cambiar mediante la variable `R2_BASE_URL`.

Implementa exactamente estos endpoints:

```text
GET  /salud
POST /v1/predict-batch
```

El servicio debe escuchar solamente en la red interna. No publiques el puerto 8100 mediante
Cloudflare, ngrok ni Internet. El único componente público será el backend principal.

## 1. Comprobación de salud

Solicitud:

```http
GET /salud
```

Respuesta HTTP 200:

```json
{
  "estado": "ok",
  "servicio": "r2",
  "modelo": "tfidf-logreg-1.0.0",
  "simulado": false,
  "contrato_version": "1.0"
}
```

`modelo` debe identificar de manera inmutable el artefacto utilizado. Cambia la versión cuando
cambien el entrenamiento, las variables, el preprocesamiento o los hiperparámetros.

## 2. Predicción por lotes

Solicitud:

```http
POST /v1/predict-batch
Content-Type: application/json
```

```json
{
  "contract_version": "1.0",
  "run_id": "r2-job-25",
  "dataset_id": 18,
  "records": [
    {
      "id_registro": "EPEN-000001",
      "p309": "Prepara y vende almuerzos en un restaurante.",
      "p308": "Cocinera",
      "p308a": "Compra insumos, cocina y atiende pedidos."
    }
  ]
}
```

Condiciones de entrada:

- Cada petición contiene entre 1 y 500 registros.
- `id_registro` y `p309` son obligatorios.
- Conserva `id_registro` exactamente; sirve para reconciliar la respuesta.
- No dependas del orden de llegada de los lotes.
- El mismo `run_id` puede repetirse después de un fallo: la operación debe ser idempotente.

Respuesta HTTP 200:

```json
{
  "contract_version": "1.0",
  "model_version": "tfidf-logreg-1.0.0",
  "run_id": "r2-job-25",
  "results": [
    {
      "id_registro": "EPEN-000001",
      "confianza_ml": 0.82,
      "candidatos": [
        {
          "codigo": "5610",
          "descripcion": "ACTIVIDADES DE RESTAURANTES Y DE SERVICIO MÓVIL DE COMIDAS",
          "prob": 0.82,
          "rank": 1
        },
        {
          "codigo": "5621",
          "descripcion": "SUMINISTRO DE COMIDAS POR ENCARGO",
          "prob": 0.11,
          "rank": 2
        }
      ]
    }
  ]
}
```

Reglas obligatorias de salida:

- Devuelve exactamente un resultado por cada `id_registro` recibido.
- No devuelvas identificadores adicionales ni duplicados.
- Los códigos deben ser clases CIIU de cuatro dígitos existentes en el catálogo acordado.
- `candidatos` contiene de 1 a 5 elementos ordenados por `rank`.
- `prob` y `confianza_ml` están entre 0 y 1.
- `confianza_ml` debe ser la probabilidad calibrada del candidato principal, no una puntuación
  arbitraria del algoritmo.
- No apliques el umbral dentro de R2. El backend lo aplica y lo registra para auditoría.

Si el modelo no puede producir candidatos seguros, no inventes un código. Devuelve:

```json
{
  "id_registro": "EPEN-000099",
  "revision_manual": true,
  "motivo": "Texto vacío o insuficiente para clasificar"
}
```

## Errores HTTP

Usa JSON también para errores:

```json
{ "error": "Descripción breve y no sensible" }
```

- `400`: solicitud o contrato inválido.
- `413`: lote demasiado grande.
- `422`: registro procesable pero inválido.
- `500`: fallo interno.
- `503`: modelo temporalmente no disponible.

No devuelvas rutas locales, trazas, claves, variables de entorno ni contenido de otros registros.

## Ejecución local para integración

Mientras desarrollas, inicia tu servicio en el puerto 8100:

```powershell
python servicio_r2.py
```

Comprueba:

```powershell
Invoke-RestMethod http://127.0.0.1:8100/salud
```

Después inicia el backend del dashboard. Para usar otra dirección:

```powershell
$env:R2_BASE_URL='http://127.0.0.1:8100'
```

El repositorio incluye `backend/r2_simulator/servicio_r2.py`. Es únicamente un simulador léxico del
contrato. Reemplázalo con tu servicio sin modificar el dashboard.

## Flujo que verá el operador

1. Inicia sesión con rol `operador` o `admin`.
2. Abre **Bases de datos**.
3. Carga un CSV original con `id_registro,p309,p308,p308a`.
4. Indica el periodo, el umbral y el modo de Qwen (`automático` o `manual`).
5. Pulsa **Procesar base con R2**.
6. El backend divide la base en lotes, llama a tu API, guarda avances y puede reanudar el trabajo.
7. Los casos con confianza mayor o igual al umbral quedan resueltos por R2.
8. Los demás quedan pendientes para la capa Qwen.
9. En modo manual, un analista abre cada caso y decide cuándo consultar Qwen.
10. En modo automático, el backend consulta Qwen de uno en uno y registra modelo, latencia y
    respuesta. Qwen solo cierra el caso si confirma el candidato Top-1 de R2; una discrepancia,
    una solicitud explícita de revisión o un fallo técnico se deriva a revisión humana.

El modo automático requiere que el backend esté iniciado con `QWEN_MODE=real`. No se utiliza la
respuesta sintética para cerrar trabajos automáticos. Debido al equipo CPU, el procesamiento
es secuencial y un trabajo grande puede continuar en segundo plano; la pantalla muestra el avance
y el lanzador reanuda los trabajos interrumpidos.

## Prueba mínima antes de entregar

- `/salud` responde en menos de 5 segundos.
- Un lote de 100 registros responde dentro de 120 segundos.
- La cantidad de resultados coincide con la cantidad de entradas.
- No hay códigos fuera del catálogo CIIU acordado.
- La misma entrada y versión del modelo producen el mismo resultado.
- Una entrada vacía o imposible se deriva; nunca recibe un candidato aleatorio.
- Se documenta el entrenamiento, semilla, partición de datos y calibración.
- Se informa Top-1, Top-3, cobertura por umbral y matriz de confusión usando datos reales
  independientes. No reportes resultados sintéticos como desempeño productivo.

## Seguridad y datos

- Trabaja con datos sintéticos hasta que el INEI autorice y entregue la base real.
- No subas P309 reales, credenciales, archivos `.env`, modelos con datos embebidos ni resultados
  sensibles a Git.
- R2 y PostgreSQL deben permanecer en red privada.
- En producción se añadirá autenticación de servicio a servicio y TLS interno.
- El backend conserva el `run_id`, versión del modelo, umbral y decisiones para trazabilidad.

## Criterio de aceptación de la conexión

La integración queda aceptada cuando el servicio real sustituya al simulador y el dashboard procese
una base sintética completa sin cambios de frontend, mostrando conteos automáticos, pendientes
para Qwen, derivados manuales y la versión real del modelo.

