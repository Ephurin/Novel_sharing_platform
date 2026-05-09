# Coding Rules

## General

- Use Python 3.10+
- Use FastAPI
- Use Pydantic for validation

## API rules

- All endpoints must return JSON
- Must include error handling

## KB rules

- Do NOT overwrite entity directly
- Use event-based updates

## AI usage

- Use LLM only for:
  - relation extraction
  - reasoning
- Do NOT use LLM for deterministic logic

## Logging

- Log all AI outputs