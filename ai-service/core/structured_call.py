"""Structured-call dispatch and request-local source correlation (no manuscript logging)."""
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any


structured_request: ContextVar[dict[str, Any] | None] = ContextVar("structured_request", default=None)
extraction_source: ContextVar[dict[str, Any] | None] = ContextVar("extraction_source", default=None)
# #149: "interactive" while an author waits on the result (writing, brainstorm); None = decide by operation.
request_priority: ContextVar[str | None] = ContextVar("request_priority", default=None)


@contextmanager
def priority_scope(priority: str):
    token = request_priority.set(priority)
    try:
        yield
    finally:
        request_priority.reset(token)


@contextmanager
def source_scope(**source: Any):
    token = extraction_source.set(source)
    try:
        yield
    finally:
        extraction_source.reset(token)


def call_structured(service: Any, *, operation: str, system_prompt: str, user_prompt: str) -> Any:
    method = getattr(service, "_call_structured", None)
    if callable(method):
        return method(operation=operation, system_prompt=system_prompt, user_prompt=user_prompt)
    # Existing fake/test adapters keep their interface; production uses LLMService.
    return service._call_llm(system_prompt=system_prompt, user_prompt=user_prompt)
