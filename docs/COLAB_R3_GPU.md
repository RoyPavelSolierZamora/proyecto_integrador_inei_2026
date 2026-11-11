# Asistente de IA en Colab GPU

Esta modalidad conserva el dashboard, PostgreSQL, R2 y la auditoría en la computadora local. Solo
los casos difíciles se envían por HTTPS al servicio R3 efímero de Colab.

```text
React → backend local → HTTPS + Bearer → Colab/R3 → Ollama/Qwen GPU
                     ← JSON validado ←
          PostgreSQL registra la decisión y la latencia
```

## Uso rápido sin editar `.env`

1. Abre `colab/R3_Qwen_EPEN_GPU.ipynb` en Google Colab.
2. Selecciona un entorno con GPU y ejecuta las celdas en orden.
   La celda de dependencias instala primero `zstd` y detiene la ejecución si Ollama o cloudflared
   no quedaron disponibles. Si una versión anterior falló con “requires zstd”, vuelve a ejecutar
   esa celda corregida y luego continúa desde la celda que inicia Ollama.
3. Sin cerrar Colab, ejecuta `conectar-colab.bat` en la raíz del proyecto.
4. Pega la URL cuando la ventana la solicite. Luego pega el token; por seguridad, el token no se
   verá mientras lo escribes.
5. El conector comprueba el túnel, detecta el modelo, actualiza `.env` sin mostrar el secreto y
   ofrece reiniciar el dashboard.
6. En **Estado del sistema**, pulsa **Comprobar ahora**. Debe indicar “Colab / GPU remota”.

No es necesario abrir ni editar `.env` manualmente. Para volver a procesar en la laptop, ejecuta
`usar-ia-local.bat`.

### Configuración manual opcional

Si necesitas diagnosticar la conexión, las tres líneas que entrega la última celda corresponden a:

   ```dotenv
   R3_MODE=remote
   R3_BASE_URL=https://direccion-temporal.trycloudflare.com
   R3_API_TOKEN=secreto-generado-en-colab
   ```

   En Windows, el archivo está en la raíz del proyecto:

   ```text
   C:\Users\Lenovo\Documents\inetgrador inei\sistema-codificacion-epen-spa\.env
   ```

   No se sube `.env` a Colab. Se edita localmente después de que Colab entregue la URL y el token.

Después reinicia el dashboard. El iniciador valida HTTPS, token, modelo y salud antes de arrancar el
   backend.

Para volver al equipo local manualmente:

```dotenv
R3_MODE=local
R3_BASE_URL=http://127.0.0.1:8000
# elimina R3_API_TOKEN del .env
```

## Seguridad y límites

- El token cambia en cada sesión y no debe guardarse en Git ni compartirse por chat.
- R3 no conserva datos; PostgreSQL local sigue siendo la fuente de verdad.
- El túnel expone únicamente R3, nunca PostgreSQL, R2, Ollama ni el backend.
- Colab y `trycloudflare.com` son adecuados para datos sintéticos y demostraciones, no para datos
  estatales reales sin aprobación institucional, contrato, retención definida y canal privado.
- La URL deja de funcionar cuando Colab termina. El backend deriva fallos a revisión humana y el
  trabajo puede reanudarse.
- Colab gratuito no garantiza GPU, continuidad ni uso como backend de una interfaz. Para operación
  estable debe migrarse el mismo servicio a una VM GPU privada.

## Para qué sirve `r3_gpu_service.py`

Es un adaptador técnico que se ejecuta dentro de Colab. Recibe del backend solo los casos difíciles,
valida el token y los candidatos CIIU, consulta el modelo en la GPU y devuelve un JSON controlado.
No contiene la base EPEN, no reemplaza PostgreSQL y no es una pantalla para el usuario final. Es el
puente necesario para que el dashboard pueda comunicarse de forma predecible con la IA temporal de
Colab.

El notebook puede reejecutarse en la misma VM: reutiliza Ollama y el archivo canónico, detiene el
R3 anterior del puerto 8000 y reemplaza el túnel previo. Si Colab renombra una carga como
`r3_gpu_service (1).py`, la celda corregida acepta el único `.py` seleccionado y lo normaliza como
`/content/r3_gpu_service.py`.

La salud se comprueba contra `127.0.0.1:8000` dentro de Colab. No se obliga a que la VM resuelva su
propio dominio `trycloudflare.com`, porque el DNS de algunos runtimes puede tardar o devolver
`Name or service not known`. El iniciador del dashboard realiza la validación pública definitiva
desde la laptop antes de arrancar el backend.

## Verificación de rendimiento

La respuesta de `/codificar` incluye `latencia_s` y `tokens_s`. Se debe comparar el mismo registro,
prompt y modelo contra el equipo local; el nombre de la GPU por sí solo no demuestra velocidad.
