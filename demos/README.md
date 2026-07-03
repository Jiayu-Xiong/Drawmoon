# Demos

Two complete, unedited Drawmoon runs. Each folder contains:

- **`template.json`** — the exact execution template (importable into the console).
- **`run-summary.json`** — execution entities + per-node token usage + totals.
- **`outputs/`** — the real artifacts the run produced.

| Demo | Pipeline | Nodes | Total tokens | Active time |
|------|----------|:-----:|:------------:|:-----------:|
| [`iclr-audiorwkv/`](iclr-audiorwkv/) | Research paper: plan → parallel sections + figures → compile → human gate → 4 peer reviews → revision | 25 | 6,421,597 | ~54 min |
| [`xuanhuan-novel-4grid/`](xuanhuan-novel-4grid/) | Creative writing: plan → 4 forked chapters → final edit → cover image | 7 | 947,599 | ~13 min |

Token totals cover the agent/LLM-API nodes. Image-generation and local-CLI (KIRO)
nodes do not report token usage and are marked accordingly in each demo.

> The novel is generated in Simplified Chinese; its template is English while the
> produced manuscript is kept as-is. No API keys or private inputs are included.
