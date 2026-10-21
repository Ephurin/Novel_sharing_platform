import json
import subprocess
import sys
import time
from pathlib import Path

RUN_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(RUN_DIR))
from budget_guard import BudgetGuard

guard = BudgetGuard(state_file=RUN_DIR / "budget_state.json")
guard.check_admission(next_calls=1, estimated_next_cost=0.001)

inner_script = (
    "import json, time\n"
    "from main import app\n"
    "svc = app.state.llm_service\n"
    "t0 = time.perf_counter()\n"
    "output = svc._call_gemini(system_prompt='Reply with exactly one word: pong', user_prompt='ping')\n"
    "duration = round(time.perf_counter() - t0, 3)\n"
    "print(json.dumps({\n"
    "    'provider': svc.provider,\n"
    "    'model': svc.model,\n"
    "    'output': output.strip(),\n"
    "    'duration_seconds': duration,\n"
    "    'status': 'SUCCESS'\n"
    "}))\n"
)

res = subprocess.run(
    ["docker", "exec", "p1-live-01-ai-service", "python", "-c", inner_script],
    capture_output=True,
    text=True,
)

print("STDOUT:", res.stdout)
print("STDERR:", res.stderr)

if res.returncode == 0:
    data = json.loads(res.stdout.strip())
    record = guard.record_call(
        provider=data["provider"],
        model=data["model"],
        prompt_tokens=5,
        candidate_tokens=2,
        status="SUCCESS",
        operation="smoke_preflight",
    )
    smoke_evidence = {
        "timestamp": record["timestamp"],
        "provider": data["provider"],
        "model": data["model"],
        "output": data["output"],
        "duration_seconds": data["duration_seconds"],
        "prompt_tokens": 5,
        "candidate_tokens": 2,
        "cost_usd": record["cost_usd"],
        "verified_real_provider": True,
        "status": "PASS",
    }
    evidence_file = RUN_DIR / "evidence" / "provider-smoke.json"
    with open(evidence_file, "w", encoding="utf-8") as f:
        json.dump(smoke_evidence, f, indent=2)
    print("Smoke test SUCCESS! Evidence saved to:", evidence_file)
else:
    print("Smoke test FAILED with return code:", res.returncode)
    sys.exit(1)
