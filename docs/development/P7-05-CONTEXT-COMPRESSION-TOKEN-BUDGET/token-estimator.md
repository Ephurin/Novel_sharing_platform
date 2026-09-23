# P7-05 token estimator

Estimator version: `utf8-json-bytes-3-v1`

Canonical serialization:

```python
json.dumps(
    prompt_context,
    ensure_ascii=False,
    sort_keys=True,
    separators=(",", ":"),
    default=str,
).encode("utf-8")
```

Estimate:

```text
ceil(serialized_utf8_bytes / 3)
```

The same serialization contract is used by:
- ContextBudgetPacker estimation;
- WritingService `context_hash`;
- LLMService Story Brain context JSON.

This makes packing reproducible, but does **not** claim exact tokenization for Gemini, Qwen, OpenAI or other providers.

The budget applies only to Story Brain context JSON. System/user prompt framing, selected text, instruction, style, request constraints and output tokens are outside this estimate.
