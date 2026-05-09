## Relation Extraction Prompt

Extract relationships between entities.

Input:
Text: {text}
Entities: {entities}

Output JSON:
[
  {"subject": "...", "relation": "...", "object": "..."}
]

## Consistency Check Prompt

Given:
- Knowledge base
- New text

Find inconsistencies.

Return:
- issue
- explanation
- suggestion

## Context Builder

Build context using:
- relevant entities
- recent events
- relationships

Output as readable markdown