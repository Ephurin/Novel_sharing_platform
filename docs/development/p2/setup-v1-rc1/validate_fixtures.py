"""Validate proposed DTO fixtures only; no extraction, auth, DB or provider tests."""
import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--tools', help='Optional isolated directory containing jsonschema==4.23.0')
args = parser.parse_args()
if args.tools:
    sys.path.insert(0, args.tools)
from jsonschema import Draft202012Validator, FormatChecker

root = Path(__file__).resolve().parent
schema = json.loads((root/'schemas.json').read_text(encoding='utf-8'))
fixtures = json.loads((root/'fixtures.json').read_text(encoding='utf-8'))
Draft202012Validator.check_schema(schema)
results = []
for case in fixtures['schema_cases']:
    target = {'$schema':schema['$schema'], '$defs':schema['$defs'], '$ref':'#/$defs/'+case['dto']}
    validator = Draft202012Validator(target, format_checker=FormatChecker())
    errors = list(validator.iter_errors(case['value']))
    assert (not errors) == case['valid'], (case['name'], [error.message for error in errors])
    results.append({'case':case['name'], 'expected_shape_valid':case['valid'], 'schema_expectation':'PASS'})
for vector in fixtures['reference_vectors']:
    canonical = json.dumps(vector['setup'], ensure_ascii=False, sort_keys=True, separators=(',',':'))
    assert hashlib.sha256(canonical.encode()).hexdigest() == vector['setup_hash']
    text = vector['setup']['text']
    assert hashlib.sha256(text.encode()).hexdigest() == vector['text_hash']
    for span in vector['spans']:
        assert text[span['start']:span['end']] == span['quote']
assert fixtures['production_implemented'] is False
assert all(case['verdict']=='NOT_RUN_NOT_IMPLEMENTED' for case in fixtures['runtime_cases'])
result = {'contract_revision':fixtures['contract_revision'],
          'validation_scope':'PROPOSED_DTO_SCHEMA_AND_REFERENCE_VECTORS_ONLY',
          'validator_version':importlib.metadata.version('jsonschema'),
          'schema_cases':len(results), 'valid_examples':sum(c['valid'] for c in fixtures['schema_cases']),
          'invalid_examples':sum(not c['valid'] for c in fixtures['schema_cases']),
          'hash_vectors':len(fixtures['reference_vectors']),
          'span_vectors':sum(len(v['spans']) for v in fixtures['reference_vectors']),
          'future_runtime_cases':len(fixtures['runtime_cases']),
          'runtime_verdict':'NOT_RUN_NOT_IMPLEMENTED',
          'sha256':{name:hashlib.sha256((root/name).read_bytes()).hexdigest()
                    for name in ['schemas.json','fixtures.json','validate_fixtures.py']},
          'cases':results}
(root/'validation-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({key:value for key,value in result.items() if key!='cases'},indent=2))
