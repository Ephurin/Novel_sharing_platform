"""FAKE_PROVIDER_OUTPUT: exact source-quote matching for the append-only core probe.

Not a semantic matcher, gold evaluator, or production reconciliation replacement.
Production validates these external-provider responses and still requires API canon review.
"""
import json


def reconciliation(text):
    data = json.loads(text.rsplit("\n\n", 1)[-1])
    decisions = []
    for candidate in data["candidates"]:
        target = ""
        for key, approved in data["approved"].items():
            if candidate["kind"] != approved["kind"]:
                continue
            new, old = candidate["payload"], approved["payload"]
            if candidate["kind"] == "event":
                same = new.get("summary") == old.get("summary")
            else:
                value = old.get("fact_value")
                if isinstance(value, dict):
                    value = value.get("value", value)
                new_value = new.get("fact_value")
                if isinstance(new_value, dict):
                    new_value = new_value.get("value", new_value)
                same = new.get("fact_key") == old.get("fact_key") and new_value == value
            if same:
                target = key
                break
        decisions.append({"proposal_id": candidate["proposal_id"],
            "action": "reuse" if target else "new", "target_id": target,
            "reason": "FAKE_PROVIDER_OUTPUT exact value comparison for append-only fixture; no quality claim"})
    return {"decisions": decisions, "removed_ids": []}
