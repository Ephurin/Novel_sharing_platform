# AI Pipeline

## When user writes a chapter

1. Extract entities using NER
2. Extract relations using LLM
3. Extract events (important actions)
4. Update Knowledge Base
5. Run consistency checks
6. Generate suggestions

---

## Event format

{
  "type": "battle",
  "actors": ["A", "B"],
  "result": "A wins",
  "chapter": 5
}

---

## Rules

- NEVER skip KB update
- ALWAYS validate before saving
- ALWAYS keep history (no overwrite)