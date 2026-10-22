"""FAKE_PROVIDER_OUTPUT for new headless slice only; no model quality claim."""
import json

def setup_output(text, fallback):
    if 'Extract ONLY explicitly supplied' not in text:
        return fallback
    # Prompt is system text followed by the source JSON; only literal source names.
    source = json.loads(text[text.index('{"setup"'):])['setup']
    return {'entities': [{'name': name, 'entity_type': kind, 'score': 9,
                          'initial_status': 'Unknown'}
                        for name, kind in [('Mai Linh', 'character'), ('Duy', 'character'), ('Cồn Vân', 'location')]
                        if name in source]}

def response_text(text, fallback):
    if 'Extract ONLY explicitly supplied' in text:
        return json.dumps(setup_output(text, {}), ensure_ascii=False)
    if 'Story Brain' in text or 'Author AI Copilot' in text:
        return json.dumps({'draft_text': 'Mai Linh đặt một thẻ giấy ghi “kiểm tra micro” cạnh máy thu.\n\nDuy đứng bên Mai Linh tại Cồn Vân.',
                           'explanation': 'FAKE_PROVIDER_OUTPUT scripted functional continuation'}, ensure_ascii=False)
    return fallback
