"""Bounded author operations. Suggestions and findings never mutate canon."""
import json
from dataclasses import asdict
from pydantic import BaseModel, Field, StrictBool
from core.structured_call import call_structured


class PlannedEvent(BaseModel):
    title: str = Field(min_length=1)
    description: str = Field(min_length=1)
    target_chapter: int = Field(ge=1)
    min_words: int = Field(default=1000, ge=1, le=10000)
    ending: bool = False


class PlanOutput(BaseModel):
    events: list[PlannedEvent] = Field(min_length=1, max_length=100)


class Finding(BaseModel):
    description: str
    evidence: str
    revision_id: str


class CheckOutput(BaseModel):
    findings: list[Finding]


class ObjectiveEvaluation(BaseModel):
    achieved: StrictBool
    reason: str = Field(min_length=1)
    ending_resolved: StrictBool = False


def run_author_operation(repository, llm, novel_id: str, operation: str, instruction: str,
                         content: str = "", revision_id: str = "", objective: str = ""):
    if llm is None:
        raise ValueError("LLM is required")
    brain = repository.get_story_brain(novel_id)
    memory = asdict(brain)
    memory.pop("proposals", None)  # Never use pending candidates as approved truth.
    from domain.canon_identity import active_events, active_facts
    memory['events'] = [asdict(e) for e in active_events(brain.events)]
    memory['facts'] = active_facts(brain.facts)
    if operation == "suggest_events":
        schema = PlanOutput
        prompt = ("Suggest future events for a novel using approved memory. They are PLANS, not history. "
                  "Follow the author's direction; for a complete plan include a final ending event. "
                  'Return JSON {"events":[{"title":"...","description":"measurable goal and payoff",'
                  '"target_chapter":1,"min_words":1000,"ending":false}]}. Do not claim events already occurred.')
    elif operation == "check_consistency":
        schema = CheckOutput
        prompt = ("Check the supplied draft against approved narrative memory. Report only contradictions with "
                  "quoted evidence from the supplied draft and the supplied revision_id; distinguish uncertain claims. "
                  'Return JSON {"findings":[{"description":"...","evidence":"exact draft quote",'
                  '"revision_id":"supplied revision_id"}]}. Empty findings if none. Do not change memory.')
    elif operation == "evaluate_objective":
        schema = ObjectiveEvaluation
        prompt = ("Evaluate whether the supplied actual prose achieves the supplied story objective. "
                  "An outline, promise to do it later, repetition or a summary of intended writing is insufficient. "
                  "ending_resolved is true only when the prose resolves the final conflict and consequences. "
                  'Return JSON {"achieved":false,"reason":"specific textual reasoning","ending_resolved":false}.')
    else:
        raise ValueError("Unsupported author operation")
    raw = call_structured(llm, operation=operation, system_prompt=prompt,
        user_prompt=json.dumps({"approved_memory": memory, "instruction": instruction,
                               "draft": content, "revision_id": revision_id, "objective": objective},
                              ensure_ascii=False, default=str))
    result = schema.model_validate_json(raw).model_dump()
    if operation == "check_consistency":
        for finding in result["findings"]:
            if finding["revision_id"] != revision_id or not finding["evidence"] or finding["evidence"] not in content:
                raise ValueError("Consistency finding has ungrounded evidence")
    return result
