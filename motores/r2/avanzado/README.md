# R2 avanzado 0.5: histórico ampliado + LinearSVC + calibración temporal

Motor estadístico vectorizado recomendado cuando existe un histórico etiquetado suficiente.
La versión activa combina n-gramas de palabras y caracteres de P309/P308/P308A, clasificación
multiclase, calibración isotónica con el último periodo cronológico y hasta tres antecedentes.

La señal `C310=6` incorpora la idea estructural del prototipo BETO del equipo, pero no se trata
como verdad infalible: prioriza 9700 con confianza inferior a 0,90 para exigir Qwen o revisión
cuando el umbral conservador es 0,90. C366 se conserva como predictor experimental y debe auditarse
por posible sesgo; nunca sustituye la descripción de actividad y tareas.

El conjunto activo es `basic` (versión 0.5). La ablación temporal no encontró una mejora consistente
al añadir C310, C311 o C309_1. El candidato multivariado 0.4 se conserva solo para experimentación:

```dotenv
R2_FEATURE_SET=multivariate
```

No activar ese valor en una entrega hasta reproducir la evaluación temporal y comparar el informe.

## Resultado temporal de referencia 0.5

Con enero de 2022 a noviembre de 2025 como entrenamiento, diciembre de 2025 como calibración y
enero-agosto de 2026 como prueba independiente:

- Top-1: 91,4 %.
- Top-3: 96,6 %.
- Con `tau=0,95`: 68,0 % de cobertura automática y 99,3 % de precisión entre los cierres de R2.
- Con `tau=0,90`: 80,4 % de cobertura y 98,4 % de precisión. Junio bajó a 97,7 %, por lo que
  0,95 es el valor inicial recomendado; el operador puede modificarlo por trabajo.

Estas cifras deben reproducirse y auditarse antes de presentarse como resultado definitivo. Cambiar
los datos, el preprocesamiento o el modelo obliga a recalibrar. La versión 0.4 no debe activarse
como ganadora hasta repetir esta misma evaluación temporal.

## Instalación

```powershell
python -m pip install -r motores\r2\avanzado\requirements.txt
```

Primero crea un histórico que no contenga el periodo de prueba:

```powershell
python motores\r2\avanzado\preparar_historico.py `
  --entrada "C:\ruta\data_historica-epen_2022_2026.csv" `
  --salida "C:\ruta\data_epen_2022_2025.csv" `
  --hasta 2025-12
```

Configura el `.env` local:

```dotenv
R2_MODE=advanced
R2_TRAINING_CSV=C:\ruta\data_epen_2022_2025.csv
R2_FEATURE_SET=basic
```

El umbral se selecciona en el dashboard para cada trabajo; 0,95 aparece por defecto y sigue siendo
editable. El primer inicio entrena el modelo y puede tardar varios minutos. El artefacto se guarda únicamente
en `.runtime/r2-models/`, fuera de Git. Los siguientes inicios reutilizan ese caché.

## Evaluación reproducible

```powershell
python motores\r2\avanzado\evaluar_temporal.py `
  --entrenamiento "C:\ruta\data_epen_2025.csv" `
  --prueba "C:\ruta\data_2026_01.csv" `
  --catalogo "motores/r3\datos\catalogo_ciiu.csv"
```

El servicio conserva `GET /salud` y `POST /v1/predict-batch` del contrato R2 v1.0. Un futuro
Transformer debe compararse contra este baseline temporal y puede reemplazar o combinar la rama
semántica sin cambiar React, PostgreSQL ni Qwen.
