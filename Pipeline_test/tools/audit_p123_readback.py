"""Read-only durable provenance/cutoff audit of an already executed owned P1 run.

Uses existing service-auth HTTP for diagnostic context reads. No author decisions,
SQL business writes or alternate repository implementation. Keeps original verdicts.
"""
import argparse
import json
from pathlib import Path
import sys
import uuid

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from Pipeline_test.tools.run_p123_headless import Probe, digest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", required=True)
    parser.add_argument("--run", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    run = Path(args.run)
    manifest = json.loads((run / "source-manifest.json").read_text(encoding="utf-8"))
    probe = Probe(args.env_file, args.output)
    probe.preflight()
    novel = manifest["novel_id"]
    uuid.UUID(novel)
    probe.save("gateway-ledger", probe.ledger())
    proposals = json.loads((run / "M0-db-proposals.json").read_text(encoding="utf-8"))
    entities = json.loads((run / "M0-db-entities.json").read_text(encoding="utf-8"))
    earliest = {}
    for p in proposals:
        if p["proposal_type"] != "entity" or p["status"] != "accepted":
            continue
        name = p["payload"]["canonical_name"]
        chapters = [e["chapter_number"] for e in p["evidence"] if e.get("chapter_number")]
        if chapters:
            earliest[name] = min(min(chapters), earliest.get(name, min(chapters)))
    script = """import os,json,urllib.request,sys
novel=sys.argv[1]
result={}
for cutoff in range(1,6):
 req=urllib.request.Request('http://127.0.0.1:8000/v1/story-brains/'+novel+'/context-preview?chapter_number='+str(cutoff),headers={'X-Service-Token':os.environ['PLATFORM_SERVICE_TOKEN'],'X-Tenant-Id':'00000000-0000-0000-0000-000000000001','X-Request-Id':'p123-readonly-cutoff'})
 result[str(cutoff)]=json.load(urllib.request.urlopen(req))['data']
print(json.dumps(result))
"""
    contexts = json.loads(probe.command(probe.compose + ["exec", "-T", "ai-service", "python", "-c", script, novel]))
    failures = []
    for cutoff, context in contexts.items():
        ids = {e["entity_id"] for e in context["entities"]}
        for entity in entities:
            first = earliest.get(entity["canonical_name"])
            if first is not None and first > int(cutoff) and entity["id"] in ids:
                failures.append({"cutoff": int(cutoff), "entity_id": entity["id"],
                    "name": entity["canonical_name"], "first_approved_source_chapter": first})
    probe.save("cutoff-contexts", contexts)
    probe.save("future-entity-cutoff", {"channel": "READ_ONLY_SERVICE_AUTH_HTTP_DIAGNOSTIC",
        "source": "Actual accepted entity proposals and immutable revision evidence; not fabricated future entity",
        "earliest_approved_source_chapters": earliest,
        "status": "FAIL" if failures else "PASS" if earliest else "NOT_ASSESSED",
        "leaks": failures})
    outbox = json.loads(probe.sql("select coalesce(json_agg(t),'[]') from revision_outbox_events t where novel_id='" + novel + "'"))
    probe.save("outbox-current", outbox)
    probe.save("proposals-current", json.loads(probe.sql("select coalesce(json_agg(t),'[]') from narrative.proposals t where novel_id='" + novel + "'")))
    probe.save("migrations", {"ai": probe.sql("select version_num from alembic_version"),
                              "postgres_identity": probe.sql("select current_database()")})
    probe.save("validation", {"tested_sha": probe.source_sha, "novel_id": novel,
        "future_entity_cutoff": "FAIL" if failures else "PASS" if earliest else "NOT_ASSESSED",
        "failure_count": len(failures), "external_provider_calls": 0,
        "prior_main_checks": json.loads((run / "checks-progress.json").read_text(encoding="utf-8")),
        "ledger_audit": "READ_FROM_OWNING_GATEWAY_HTTP; original failed ledger-lock attempt preserved"})
    print(json.dumps({"future_entity_leaks": len(failures), "earliest_count": len(earliest)}))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
