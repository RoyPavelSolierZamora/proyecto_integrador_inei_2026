# Baseline R2 con casos históricos

Primer motor R2 reproducible para EPEN. Combina TF-IDF de palabras, bigramas, caracteres, una firma
fonética de bajo peso, centroides por código y vecinos históricos. Evalúa la calidad de P309 y
deriva entradas sin evidencia suficiente. Solo utiliza la biblioteca estándar de Python.

No reemplaza una evaluación productiva. Con 100 registros y 56 clases, la cobertura es limitada y
la confianza todavía no está calibrada con un trimestre independiente. Por seguridad, el servicio
limita `confianza_ml` a 0,69; con el umbral operativo 0,70 sus resultados funcionan como candidatos
para Qwen o el codificador, no como cierres automáticos.

## Entrenamiento

Acepta los campos internos (`id_registro,p309,p308,p308a,codigo_ciiu_esperado`) o los campos reales
(`ID_C200,C309,C308,C308A,C309_COD`). El código esperado se usa solamente al construir el modelo y
nunca debe viajar en una solicitud de predicción.

```powershell
cd motores\r2\baseline
python -m unittest -v test_motor.py
python servicio_r2.py --datos "C:\ruta\historico_codificado.csv"
python evaluar_robustez.py --entrenamiento "C:\ruta\historico_codificado.csv" --catalogo "..\..\motores/r3\datos\catalogo_ciiu.csv"
```

El servicio conserva el contrato del dashboard:

```text
GET  http://127.0.0.1:8100/salud
POST http://127.0.0.1:8100/v1/predict-batch
```

No ejecutes simultáneamente el simulador y este servicio en el puerto 8100. Para una evaluación
real, entrena con trimestres anteriores y prueba con un trimestre posterior, sin repetir personas
ni textos entre ambos conjuntos. Después debe calibrarse la confianza con ese conjunto temporal.

La prueba de robustez crea en memoria versiones sin contexto, abreviadas y con errores. Sus cifras
no son exactitud productiva porque parten de los mismos casos usados para entrenar.

## Seleccionarlo en el dashboard

El iniciador usa el simulador mientras no se configure lo contrario. Para iniciar este baseline,
agrega estas dos líneas al `.env` local y vuelve a ejecutar `iniciar-dashboard.bat`:

```dotenv
R2_MODE=baseline
R2_TRAINING_CSV=C:\ruta\historico_codificado.csv
```

Para regresar al simulador cambia `R2_MODE=simulator`. No es necesario modificar el frontend, el
backend ni la base PostgreSQL.
