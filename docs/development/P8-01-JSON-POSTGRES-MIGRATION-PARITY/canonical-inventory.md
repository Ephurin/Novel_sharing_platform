# Committed Legacy StoryKB Inventory

CI run: https://github.com/Ephurin/Novel_sharing_platform/actions/runs/35844244069

All committed StoryKB JSON files currently return `action=ready`, `safe_to_apply=true`, no unsupported canonical rows, and no ID collisions.

| Story | Result | Notable warning classes |
|---|---|---|
| writing_session_550 | ready | entity_states, relation_history, unresolved relationship endpoint labels |
| writing_session_599 | ready | entity_states, relation_history, unresolved relationship endpoint labels |
| writing_session_968 | ready | entity_states, relation_history, unresolved relationship endpoint labels |
| writing_session_492 | ready | entity_states, relation_history, unresolved relationship endpoint labels |
| test2 | ready | entity_states, relation_history, unresolved event participant / relationship labels |
| test_narrative_v2 | ready | event_history, current_world_state.characters, unresolved relationship endpoint labels |

Warnings are deliberately not promoted into canonical PostgreSQL FK truth. Legacy-only fields remain preserved in the untouched source JSON archive.

`data/writing_session_*.json` is excluded from the production image by `ai-service/.dockerignore`; CI copies the committed checkout data to a temporary path inside the production container for dry-run validation.
