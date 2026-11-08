"""Strict manual future-plan snapshot commands; no Canon-authority fields."""
from typing import Annotated, Literal
from uuid import UUID
from pydantic import Field, model_validator
from api.setup_schemas import StrictDTO

UUIDString=Annotated[str,Field(pattern=r'^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$')]
Text=Annotated[str,Field(max_length=10000)]
class PlanParticipant(StrictDTO):
    entity_id: UUIDString | None = None
    name_hint: Annotated[str,Field(min_length=1,max_length=255)] | None = None
    @model_validator(mode='after')
    def one(self):
        if (self.entity_id is None)==(self.name_hint is None):raise ValueError('Choose exact approved ID or unresolved hint')
        return self
class FutureEvent(StrictDTO):
    event_id: UUIDString
    text: Text
    participants: list[PlanParticipant]=Field(default_factory=list,max_length=100)
class PlanObjectiveEdit(StrictDTO):
    objective_id: UUIDString
    expected_intent_version: Annotated[int,Field(ge=0)]
    target_chapter: Annotated[int,Field(ge=1)]
    title: Annotated[str,Field(min_length=1,max_length=255,pattern=r'\S')]
    description: Text=''
    events: list[FutureEvent]=Field(default_factory=list,max_length=100)
    dependencies: list[UUIDString]=Field(default_factory=list,max_length=500)
class PlanEditCommand(StrictDTO):
    contract_version: Literal['plan-edit-v1']
    action: Literal['save','fork','activate','skip','delete']
    idempotency_key: Annotated[str,Field(min_length=1,max_length=128)]
    expected_plan_version: Annotated[int,Field(ge=0)]
    source_plan_id: UUIDString | None=None
    source_outline: Annotated[str,Field(max_length=200000)]=''
    private_notes: Text=''
    objectives: list[PlanObjectiveEdit]=Field(default_factory=list,max_length=500)
    @model_validator(mode='after')
    def graph(self):
        ids=[o.objective_id for o in self.objectives]
        chapters=[o.target_chapter for o in self.objectives]
        events=[e.event_id for o in self.objectives for e in o.events]
        if len(set(ids))!=len(ids) or len(set(chapters))!=len(chapters) or len(set(events))!=len(events):raise ValueError('Duplicate plan membership')
        graph={o.objective_id:o.dependencies for o in self.objectives}
        for o in self.objectives:
            if len(set(o.dependencies))!=len(o.dependencies) or any(d not in graph or d==o.objective_id for d in o.dependencies):raise ValueError('Invalid dependency')
        visiting,visited=set(),set()
        def visit(node):
            if node in visiting:raise ValueError('Dependency cycle')
            if node in visited:return
            visiting.add(node)
            for d in graph[node]:visit(d)
            visiting.remove(node);visited.add(node)
        for node in graph:visit(node)
        if self.action in ('activate','delete','fork') and self.source_plan_id is None:raise ValueError('Source required')
        if self.action in ('activate','skip','delete') and (self.objectives or self.source_outline or self.private_notes):raise ValueError('Lifecycle commands cannot edit content')
        return self
