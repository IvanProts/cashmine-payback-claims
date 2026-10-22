#!/usr/bin/env python3
"""Turn a raw Claude Code session export (transcript.jsonl) into reviewable, redacted AI logs.

Usage:  python3 -I scripts/export-ai-log.py <raw transcript.jsonl> <output dir> [name]

Writes  <name>.redacted.jsonl  (conversation records only) and  <name>.md  (readable rendering).

Kept:    user and assistant records: user prompts, assistant text, tool calls and tool results.
Dropped: API request blobs, system/harness attachments, hook records, opaque thinking signatures (thinking text is
         empty in the export), and base64 screenshot data (replaced by a placeholder).
Optional: AI_LOG_EXTRA_REDACT="word1,word2" also redacts those literals (case-insensitive), e.g. a personal name.
Redacted by PATTERN (never by literal secret): bearer tokens, GitHub/OpenAI/AWS/JWT-style keys, e-mail addresses
         (except noreply@anthropic.com and *@example.com), and the local home directory.
"""
import json
import os
import re
import sys
from pathlib import Path

EMAIL_ALLOW = re.compile(r"^(noreply@anthropic\.com|[^@]+@example\.(com|org))$", re.I)
RULES = [
    (re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]{6,}"), "Bearer <redacted-token>"),
    (re.compile(r"\b(gh[opsur]_|github_pat_)[A-Za-z0-9_]{10,}"), "<redacted-github-token>"),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{16,}"), "<redacted-api-key>"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "<redacted-aws-key>"),
    (re.compile(r"\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{8,}(\.[A-Za-z0-9_-]+)?"), "<redacted-jwt>"),
    (re.compile(r"/Users/[A-Za-z0-9._-]+"), "<home>"),
]
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
DROP_KEYS = {"signature", "serverClassifierRequest", "requestRef", "wireToolInputs", "toolUseResult", "caller"}


EXTRA = [re.compile(re.escape(w), re.I) for w in os.environ.get("AI_LOG_EXTRA_REDACT", "").split(",") if w.strip()]


def redact(s: str) -> str:
    for rx, rep in RULES:
        s = rx.sub(rep, s)
    # Whole addresses first, so a literal inside an e-mail never leaves the rest of the address behind.
    s = EMAIL_RE.sub(lambda m: m.group(0) if EMAIL_ALLOW.match(m.group(0)) else "<redacted-email>", s)
    for rx in EXTRA:
        s = rx.sub("<redacted-name>", s)
    return s


def clean(o):
    if isinstance(o, str):
        return redact(o)
    if isinstance(o, list):
        return [clean(x) for x in o]
    if isinstance(o, dict):
        if o.get("type") == "image" and "source" in o:
            return {"type": "image", "omitted": "screenshot (base64 removed)"}
        return {k: clean(v) for k, v in o.items() if k not in DROP_KEYS}
    return o


def trunc(s: str, n: int) -> str:
    return s if len(s) <= n else s[:n] + f" …[truncated {len(s) - n} chars]"


def result_text(content) -> str:
    if isinstance(content, str):
        return content
    out = []
    for b in content or []:
        if isinstance(b, dict):
            out.append(b["text"] if b.get("type") == "text" else f"[{b.get('type')}]")
    return "\n".join(out)


def main(src: str, out_dir: str, name: str = "session"):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    kept, md = [], []
    for line in Path(src).read_text(encoding="utf-8").splitlines():
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            continue
        if r.get("type") not in ("user", "assistant"):
            continue
        r = clean(r)
        kept.append({k: r[k] for k in ("type", "timestamp", "uuid", "parentUuid", "sessionId", "message") if k in r})
        ts = r.get("timestamp", "")
        content = r.get("message", {}).get("content")
        if isinstance(content, str):
            md.append(f"## User · {ts}\n\n{content.strip()}\n")
            continue
        for b in content or []:
            if not isinstance(b, dict):
                continue
            t = b.get("type")
            if t == "text" and r["type"] == "assistant":
                md.append(f"## Assistant · {ts}\n\n{b['text'].strip()}\n")
            elif t == "text" and r["type"] == "user" and not b["text"].lstrip().startswith("<system-reminder>"):
                md.append(f"## User · {ts}\n\n{b['text'].strip()}\n")
            elif t == "tool_use":
                md.append(f"> **tool call** `{b.get('name')}` {trunc(json.dumps(b.get('input'), ensure_ascii=False), 700)}\n")
            elif t == "tool_result":
                md.append(f"> **tool result** {trunc(result_text(b.get('content')).strip(), 500)}\n")
    jsonl = out / f"{name}.redacted.jsonl"
    jsonl.write_text("\n".join(json.dumps(k, ensure_ascii=False) for k in kept) + "\n", encoding="utf-8")
    header = (
        f"# AI conversation log: {name}\n\n"
        "Readable rendering of the real Claude Code session (redacted; see ai-logs/README.md). User prompts and assistant "
        "text are complete; tool calls and results are abbreviated here and complete in the .jsonl file.\n\n---\n\n"
    )
    (out / f"{name}.md").write_text(header + "\n".join(md), encoding="utf-8")
    print(f"{len(kept)} records -> {jsonl} ({jsonl.stat().st_size} bytes), {out / (name + '.md')}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], *(sys.argv[3:4] or []))
