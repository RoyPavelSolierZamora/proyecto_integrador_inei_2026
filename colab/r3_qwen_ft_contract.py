"""Construcción y validación determinista de solicitudes del Qwen ajustado."""
import json
import re

PROMPT_VERSION = 'qwen-ft-ciiu-candidatos-v1'
SYSTEM = 'Clasifica el registro laboral EPEN en su código exacto CIIU Rev. 4 de cuatro dígitos.'

def build_prompt(item, candidates):
    def value(key):
        return str(item.get(key) or '').strip()[:2000] or 'No informado'
    lines = '\n'.join(f"- {row['codigo']}: {row['descripcion']}" for row in candidates)
    return (f'Clasifica esta actividad en una clase CIIU Rev. 4.\n\n'
            f'Actividad: {value("p309")}\nOcupación: {value("p308")}\nTareas: {value("p308a")}\n\n'
            f'Candidatos:\n{lines}\n\nSelecciona un candidato y responde con un JSON que contenga\n'
            'las claves "CIIU" y "Razon".')

def parse_output(raw, candidates):
    text = str(raw or '').strip()
    # Aceptar una sola respuesta JSON completa, sin extraer códigos de texto roto.
    if text.startswith('```'):
        text = re.sub(r'^```(?:json)?\s*|\s*```$', '', text, flags=re.IGNORECASE).strip()
    try:
        data = json.loads(text)
    except (ValueError, TypeError):
        return {'decision': 'revision_humana', 'codigo': None, 'justificacion': 'Respuesta de IA con formato inválido.'}
    if not isinstance(data, dict):
        return {'decision': 'revision_humana', 'codigo': None, 'justificacion': 'Respuesta de IA con formato inválido.'}
    if str(data.get('decision', '')).strip().lower() in {'revision_humana', 'revision', 'revisión'}:
        return {'decision': 'revision_humana', 'codigo': None, 'justificacion': 'El asistente solicita revisión humana.'}
    code = str(data.get('CIIU') or data.get('codigo') or '').strip()
    if code not in {str(candidate['codigo']) for candidate in candidates}:
        return {'decision': 'revision_humana', 'codigo': None, 'justificacion': 'La IA no eligió un candidato válido.'}
    reason = data.get('Razon') or data.get('justificacion') or ''
    if not isinstance(reason, str):
        reason = ''
    return {'decision': 'seleccionar', 'codigo': code, 'justificacion': reason.strip()[:240]}
