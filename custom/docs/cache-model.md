# Cache Model

This document describes the caching strategy for workflow agent nodes.

## Overview

Caching avoids redundant agent executions by reusing results when the node configuration and inputs have not changed.

## Cache Modes

### Off

Always execute the agent node. No caching is performed.

Use cases: debugging, testing, when results must be fresh.

### Input-Only (default)

The cache key is a SHA-256 hash of:

- Provider ID
- Agent mode
- Context mode
- Prompt text
- Working directory
- Max iterations and timeout
- Allow file writes flag
- Custom command/args
- Upstream output trace ID

If all these values match a previous execution, the cached result is returned.

Use cases: most workflow runs where only the configuration matters.

### Files-Aware

In addition to input-only fields, the cache key also includes hashes of:

- System prompt file (if set)
- Build prompt file (if set)
- Planner file (if set)
- Subagent config files (if set)
- Files matched by `cacheFiles` glob patterns

Any change to these files invalidates the cache.

Use cases: when node behavior depends on external files that may change between runs.

## Cache Key Generation

```
SHA-256(
  provider +
  mode +
  contextMode +
  prompt +
  cwd +
  maxIterations +
  timeoutMs +
  allowFileWrites +
  customCommand +
  customArgs +
  upstreamTraceId +
  (files-aware mode) systemPromptFile hash +
  (files-aware mode) buildPromptFile hash +
  (files-aware mode) plannerFile hash +
  (files-aware mode) subagentFiles hashes +
  (files-aware mode) cacheFiles hashes
)
```

## Cache Storage

Cache entries are stored as JSON files in the runtime data directory:

```
{dataDir}/cache/{sha256-key}.json
```

Each entry contains:

```json
{
  "key": "abcdef...",
  "output": { /* AgentNodeOutput */ },
  "configHash": "sha256 of JSON-serialized config",
  "fileHashes": { "path/to/file.ext": "sha256" },
  "createdAt": "2026-06-04T12:00:00.000Z"
}
```

## Cache Browsing

The runtime exposes cache endpoints:

- `GET /cache` – list all entries with keys and creation times
- `DELETE /cache` – clear all entries

The frontend cache inspector shows current entries and allows manual clearing.

## Cache Bypass

The `bypassCache` flag can be set at the API level to skip cache lookup for a specific run. The result is still written to cache after execution, so subsequent runs will hit cache.

## Future Considerations

- **Semantic cache**: Hashing doesn't capture semantic equivalence. Future versions could use embedding-based similarity.
- **Provider token cache**: Provider-side prefix caching works naturally when prompts are stable and structured.
- **TTL-based expiry**: Entries could expire after a configurable time period.
- **Distributed cache**: For multi-machine setups, cache could be stored in a shared database.
