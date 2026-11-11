# Evaluación justa: R2 avanzado 0.4 frente a BETO

BETO no sustituirá al motor activo por el porcentaje producido con una partición aleatoria. Ambos
deben usar exactamente este protocolo:

| Etapa | Periodo |
|---|---|
| Entrenamiento | enero–noviembre de 2025 |
| Calibración de confianza | diciembre de 2025 |
| Prueba cerrada | enero de 2026 |

## Métricas obligatorias

- Top-1 y Top-3 sobre todos los registros.
- Clases no observadas en entrenamiento.
- Cobertura y precisión aceptada para τ 0,70, 0,80, 0,90 y 0,95.
- F1 macro y ponderado.
- Resultados separados para firmas repetidas y no repetidas entre periodos.
- Latencia, memoria, errores y prueba de datos sucios.
- Ablación con y sin C310, C311 y C366; C366 requiere revisión de sesgo.

`colab/r2_beto_temporal.py` implementa la separación, calibración por temperatura y evaluación. El
ganador debe además respetar el contrato R2 v1.0 o envolverse con un adaptador; React, PostgreSQL y
R3 no deben depender de la tecnología interna del clasificador.

La regla C310=6 se incorpora en R2 0.4 como señal que prioriza 9700 pero limita su confianza a 0,89.
Así no cierra automáticamente con el umbral conservador 0,90 hasta que el criterio sea validado.
