# AI & Writing Copilot API

> **Scope warning (2026-10-21):** This file documents a historical **Platform AI suggestion/classification/style API subset**, not the full Narrative Memory P1/P2/P3 route contract. Do **not** infer all current Human Entity Review/Story Brain/Autonomous endpoints from this list. Source-inspected Node/FastAPI routes and state semantics: [CURRENT_API_IMPLEMENTATION_MATRIX.md](../../ai-service/docs/CURRENT_API_IMPLEMENTATION_MATRIX.md). Accepted product workflow: [WORKFLOW_CONTRACT.md v1.4](../../Pipeline_test/WORKFLOW_CONTRACT.md). Endpoint presence is not live E2E acceptance.

Related SRS: `docs/SRS/ai-intelligence-service.md`

## Resource Summary

| Resource | Description |
| :--- | :--- |
| `MetadataSuggestion` | AI-generated title/tag suggestions. |
| `NovelClassification` | AI-generated genre/category scoring. |
| `StyleAnalysis` | Writing-style, length, tone, clarity, and revision analysis for Author assistance. |
| `CopilotSuggestion` | Draft writing suggestion generated from story context. |
| `ConsistencyWarning` | Non-blocking plot/character/timeline contradiction warning for Author review. |
| `ContextChangeProposal` | Proposed update to character, timeline, or plot summary context. |

## Endpoints

### POST /ai/metadata-suggestions

Suggest title and tags from text.

**Auth:** Required  
**Roles:** Author

**Request**

```json
{
  "novelId": "novel_123",
  "text": "Synopsis or chapter excerpt..."
}
```

**Response**

```json
{
  "success": true,
  "data": {
    "titles": ["The Moonlit Archive"],
    "tags": ["magic", "academy", "mystery"]
  },
  "error": null,
  "meta": {}
}
```

**Errors:** `AI_001`, `AI_002`

### POST /ai/classify-novel

Suggest genre classification from synopsis.

**Auth:** Required  
**Roles:** Author

**Request**

```json
{
  "novelId": "novel_123",
  "synopsis": "Long synopsis..."
}
```

**Response**

```json
{
  "success": true,
  "data": {
    "genres": [
      {
        "genre": "FANTASY",
        "score": 0.91
      }
    ]
  },
  "error": null,
  "meta": {}
}
```

### POST /ai/analyze-style

Analyze chapter style, length, tone, clarity, and revision opportunities for Author assistance. This endpoint does not perform content moderation or plot consistency checking.

**Auth:** Required  
**Roles:** Author, Admin

**Request**

```json
{
  "chapterId": "chapter_123",
  "content": "Chapter content..."
}
```

**Response**

```json
{
  "success": true,
  "data": {
    "wordCount": 1200,
    "styleRisk": "LOW",
    "tone": "MYSTERIOUS",
    "clarityNotes": ["The opening scene is easy to follow."],
    "revisionSuggestions": ["Consider adding one sensory detail before the dialogue."]
  },
  "error": null,
  "meta": {}
}
```

### POST /ai/copilot/suggestions

Generate writing suggestions from story context.

**Auth:** Required  
**Roles:** Author

**Request Fields**

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `novelId` | string | Yes | Novel being edited. |
| `chapterId` | string | No | Current chapter being edited. |
| `currentDraft` | string | Yes | Current draft text in the editor. |
| `additionalContextText` | string | No | Extra novel prose/context pasted by the Author for this generation request only. It is not stored automatically. |
| `instruction` | string | Yes | Author instruction for the Copilot. |
| `includeContext` | object | Yes | Whether to load stored Character, Timeline, and Plot Summary context. |

**Request**

```json
{
  "novelId": "novel_123",
  "chapterId": "chapter_123",
  "currentDraft": "Current text...",
  "additionalContextText": "Earlier in the novel, Liora discovered that the archive door reacts only to memories she has forgotten. This scene should preserve that mystery and avoid revealing the full truth yet.",
  "instruction": "Continue the scene with a tense discovery.",
  "includeContext": {
    "characters": true,
    "timeline": true,
    "plotSummaries": true
  }
}
```

**Response**

```json
{
  "success": true,
  "data": {
    "suggestionId": "suggestion_123",
    "draftSuggestion": "Suggested continuation...",
    "contextProposalIds": ["proposal_123"]
  },
  "error": null,
  "meta": {}
}
```

**Notes**

- Suggested draft text is not saved automatically.
- Context proposals must be approved through Novel & Chapter API.
- `additionalContextText` is temporary request-level context. It can include a novel excerpt, scene summary, style sample, or continuity note that the Author wants the Copilot to consider.
- If `additionalContextText` conflicts with stored Character/Timeline/Plot Summary data, the API should return the suggestion with a low-confidence warning or create a context proposal instead of silently overwriting stored context.

**Errors:** `AI_001`, `AI_002`, `CONTENT_005`

### POST /ai/copilot/consistency-check

Check the current draft against story context and return non-blocking consistency warnings.

**Auth:** Required  
**Roles:** Author

**Request Fields**

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `novelId` | string | Yes | Novel being checked. |
| `chapterId` | string | No | Current chapter being checked. |
| `currentDraft` | string | Yes | Current draft text to analyze. |
| `additionalContextText` | string | No | Temporary scene note/excerpt to include in this check only. |
| `includeContext` | object | Yes | Whether to load stored Character, Timeline, and Plot Summary context. |

**Request**

```json
{
  "novelId": "novel_123",
  "chapterId": "chapter_123",
  "currentDraft": "Current chapter text...",
  "additionalContextText": "Cael should not know the archive door's true name yet.",
  "includeContext": {
    "characters": true,
    "timeline": true,
    "plotSummaries": true
  }
}
```

**Response**

```json
{
  "success": true,
  "data": {
    "checkId": "check_123",
    "contextHealthScore": 86,
    "warnings": [
      {
        "warningId": "warning_123",
        "severity": "MEDIUM",
        "type": "TIMELINE_CONFLICT",
        "message": "Cael appears to know the archive door's true name before the reveal event.",
        "relatedText": "Cael whispered the true name before Liora reached the door.",
        "relatedContext": [
          {
            "targetType": "STORY_TIMELINE",
            "targetId": "event_42"
          }
        ],
        "suggestedAction": "Revise Cael's line or create a timeline update proposal."
      }
    ]
  },
  "error": null,
  "meta": {}
}
```

**Notes**

- Consistency warnings are advisory and do not block publishing.
- The endpoint does not mutate draft text or official story context.
- If the warning indicates stored context may be outdated, the UI may let Author create a Context Change Proposal.
- Warnings may be stored in Copilot logs for 90 days; MVP does not require a dedicated relational warning table.

**Errors:** `AI_001`, `AI_002`, `AI_005`, `CONTENT_005`

### POST /ai/copilot/context-proposals

Generate context update proposals without directly committing them.

**Auth:** Required  
**Roles:** Author

**Request**

```json
{
  "novelId": "novel_123",
  "chapterId": "chapter_123",
  "sourceText": "Recently written chapter text...",
  "targetTypes": ["PLOT_SUMMARY", "STORY_TIMELINE"]
}
```

**Response**

```json
{
  "success": true,
  "data": [
    {
      "proposalId": "proposal_123",
      "targetType": "PLOT_SUMMARY",
      "status": "PENDING",
      "proposedPayload": {
        "scope": "CHAPTER",
        "summary": "AI-generated summary..."
      }
    }
  ],
  "error": null,
  "meta": {}
}
```

**Notes**

- The proposal is stored by Novel & Chapter Service as `CONTEXT_CHANGE_PROPOSAL`.
- Author approval is required before official context data changes.
