# R2 avanzado 0.4: multivariado + LinearSVC + calibración temporal

Motor estadístico vectorizado para reemplazar el baseline lineal cuando exista un histórico
etiquetado suficiente. Combina n-gramas de palabras y caracteres, P309/P308/P308A, las variables
opcionales C310/C311/C366, clasificación multiclase, calibración isotónica con el último mes
histórico y recuperación de hasta tres antecedentes.

La señal `C310=6` incorpora la idea estructural del prototipo BETO del equipo, pero no se trata
como verdad infalible: prioriza 9700 con confianza inferior a 0,90 para exigir Qwen o revisión
cuando el umbral conservador es 0,90. C366 se conserva como predictor experimental y debe auditarse
por posible sesgo; nunca sustituye la descripción de actividad y tareas.

El conjunto activo sigue siendo `basic` (versión 0.3 ya evaluada). Para una prueba A/B aislada:

```dotenv
R2_FEATURE_SET=multivariate
```

No activar ese valor en una entrega hasta reproducir la evaluación temporal y comparar el informe.

## Resultado temporal de referencia 0.3

Con 2025 como histórico y enero de 2026 como prueba independiente:

- Top-1: 88,3 %.
- Top-3: 94,0 %.
- Con `tau=0,90`: 67,7 % de cobertura automática, 98,8 % de precisión entre los cierres de R2 y
  32,3 % enviado a Qwen o revisión.

Estas cifras deben reproducirse y auditarse antes de presentarse como resultado definitivo. Cambiar
los datos, el preprocesamiento o el modelo obliga a recalibrar. La versión 0.4 no debe activarse
como ganadora hasta repetir esta misma evaluación temporal.

## Instalación

```powershell
python -m pip install -r backend\r2_advanced\requirements.txt
```

Configura el `.env` local:

```dotenv
R2_MODE=advanced
R2_TRAINING_CSV=C:\ruta\data_epen_2025.csv
R2_THRESHOLD=0.90
```

El primer inicio entrena el modelo y puede tardar varios minutos. El artefacto se guarda únicamente
en `.runtime/r2-models/`, fuera de Git. Los siguientes inicios reutilizan ese caché.

## Evaluación reproducible

```powershell
python backend\r2_advanced\evaluar_temporal.py `
  --entrenamiento "C:\ruta\data_epen_2025.csv" `
  --prueba "C:\ruta\data_2026_01.csv" `
  --catalogo "r3_local\datos\catalogo_ciiu.csv"
```

El servicio conserva `GET /salud` y `POST /v1/predict-batch` del contrato R2 v1.0. Un futuro
Transformer debe compararse contra este baseline temporal y puede reemplazar o combinar la rama
semántica sin cambiar React, PostgreSQL ni Qwen.
