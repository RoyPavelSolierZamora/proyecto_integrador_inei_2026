# Comparación experimental de asistentes

El sistema operativo no cambia de modelo al preparar esta prueba. El adaptador
`colab/r3_qwen_ft_service.py` requiere una sesión GPU CUDA con torch, transformers,
peft y bitsandbytes, además del modelo base Qwen2.5 7B de confianza, la carpeta
del adaptador LoRA y el catálogo CIIU. No contiene el modelo base ni se ha validado
en una GPU en esta instalación. Se carga junto con `colab/r3_gpu_service.py` y
`colab/r3_qwen_ft_contract.py` en la misma carpeta.

Variables de entorno del servicio FT: `QWEN_FT_BASE` (modelo base),
`QWEN_FT_ADAPTER` (carpeta del adaptador), `R3_CATALOG_PATH`, `R3_PORT` y `R3_API_TOKEN` (mínimo 24
caracteres). Se inicia con `python r3_qwen_ft_service.py`. Solo escucha en 127.0.0.1.
El servicio usa los mismos candidatos pero una instrucción corta como la evaluada
en el piloto del modelo ajustado; acepta las claves `codigo` o `CIIU`, y envía a
revisión JSON incompletos y códigos fuera del conjunto. El prompt no reproduce el
RAG completo del notebook del compañero; la comparación con Qwen3 incluye la
diferencia de instrucciones entre ambos servicios.

`colab/comparar_asistentes.py` ejecuta una prueba por pares contra dos servicios R3:

```text
python colab/comparar_asistentes.py --entrada entrada.jsonl --referencia referencia.csv --url-a http://127.0.0.1:8000 --url-b http://127.0.0.1:8001 --salida resultados.json
```

El JSONL contiene una línea por caso con `id_registro`, `p309`, `p308`, `p308a`
y `candidatos` del mismo motor BETO. El CSV separado contiene únicamente
`id_registro,codigo_esperado` y permanece local: nunca se envía a los servicios.
Si los endpoints usan token, definir `R3_TOKEN_A` y `R3_TOKEN_B` en el entorno;
nunca pegarlos en el comando ni en Git. Para servicios remotos exige HTTPS.
La salida incluye identificadores y códigos esperados: mantenerla fuera de Git.

El informe separa cobertura, precisión entre respuestas, confirmaciones Top-1,
revisiones, errores técnicos y latencia. Una respuesta inválida o fuera de candidatos
cuenta como revisión/error, no como acierto. Primero usar casos sintéticos. Los datos
reales solo pueden enviarse a servicios externos con autorización institucional y
controles apropiados. Para comparar septiembre sin fuga debe demostrarse la fecha de
corte del entrenamiento y de los antecedentes utilizados. Las métricas dependen del
conjunto evaluado y no certifican el uso automático en producción.
