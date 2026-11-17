# BETO V2 experimental

El servicio `backend/r2_beto/servicio_r2.py` adapta BETO V2 al contrato R2 1.0.
Usa siete variables y la preparación del cuaderno entregado. El clasificador
no cierra registros automáticamente: sus puntuaciones softmax no están calibradas.
Con IA automática Qwen puede sugerir un código, pero incluso la confirmación del
Top-1 queda en revisión humana hasta validar la combinación BETO + IA.

El modelo y `clases_ciiu.npy` deben proceder de una fuente confiable: el archivo
de clases es un array de objetos que requiere pickle. Nunca aceptar archivos de
clases de origen desconocido. El modelo y los datos no se incluyen en Git.

Instalar en el Python del sistema: `python -m pip install torch "transformers>=4.48,<5" safetensors`.
El servicio también utiliza las dependencias de `backend/r2_advanced/requirements.txt`.
Configurar `R2_MODE=beto` y `R2_BETO_MODEL_PATH` con la carpeta local del modelo en
el `.env` de la instalación, aplicar migraciones y reiniciar el sistema. Para volver
al anterior usar `R2_MODE=advanced`. No modificar la configuración durante un trabajo.

Los CSV nuevos admiten `C309_1`. Las bases ya importadas no recuperan ese campo
automáticamente: deben reimportarse desde su fuente si se desea utilizarlo.
La regla C310=6 no se aplica automáticamente. Comparar R2 y BETO con los mismos
casos y una partición temporal independiente antes de habilitar cierre automático.
