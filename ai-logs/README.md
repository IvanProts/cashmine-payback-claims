# AI logs

Real, redacted exports of the Claude Code session in which this app was built (one main agent, no subagents).

| File | What it is |
| --- | --- |
| `session-01.md` | Readable rendering: complete user prompts and assistant text; tool calls/results abbreviated. Start here. |
| `session-01.redacted.jsonl` | Same conversation as structured records (user/assistant messages, full tool calls and results). |

The required pre-implementation discussion (two post-claim balance approaches, recommendation, decimal handling, unknown
outcomes/idempotency) is in the first assistant answer, followed by the human's "Decision confirmed: B" and corrections.

## How they were produced
`scripts/export-ai-log.py` converts the raw session export (`python3 -I scripts/export-ai-log.py <transcript.jsonl> ai-logs`).
It keeps only the user/assistant conversation and removes API-request blobs, harness attachments, hook records, opaque
thinking signatures (the exported thinking text is empty) and base64 screenshot data.

## Redaction (by pattern)
Bearer tokens, GitHub/OpenAI/AWS/JWT-style keys, e-mail addresses (except `noreply@anthropic.com` and `*@example.com`), and
the local home directory (`/Users/<name>` becomes `<home>`). The real API token was never typed or pasted into the
conversation. The only token-like strings are fake test values used for local runs and 401 checks (`mock-token`,
`invalid-test-token`, `dummy-invalid-token`). The redacted files were re-scanned for the patterns above and for
high-entropy strings in user-authored text; none remained.

The export is a snapshot taken during the session; `session-01.*` is regenerated from the final export before submission.
