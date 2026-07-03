# Session Model

This document describes how sessions work across workflow nodes.

## Overview

A session represents the state of a single agent invocation chain. Sessions allow downstream nodes to build on the work of upstream nodes without re-executing them.

## Session State

```typescript
interface SessionState {
  id: string
  providerSessionId?: string
  contextMode: ContextMode
  messages: SessionMessage[]
  summary?: string
  artifacts: Artifact[]
  diff?: string
  parentId?: string
  traceId: string
  createdAt: string
  updatedAt: string
}
```

## Context Modes

### Fresh

Start completely clean. No upstream information is passed to the node.

```
[Node A: fresh] → [Node B: fresh] (no connection)
```

Used for: independent parallel tasks, testing, clean-slate operations.

### Inherit

Continue the upstream session directly. All messages from the upstream session are available.

```
[Node A] → [Node B: inherit] (full message history)
```

Only works if the provider supports native session resume. For providers without this feature, the runtime simulates inheritance by building a prompt from the upstream summary.

### Fork

Copy the upstream session context and branch execution. The forked session starts with all upstream messages but diverges from that point.

```
[Node A] → [Node B: fork] (copy context, diverge)
     ↓
[Node C: fresh] (independent)
```

Used for: exploring alternative approaches, comparing agent outputs.

### Summary

Pass only the summarised output from the upstream node. The summary is injected as a system message.

```
[Node A] → [summary: "Implemented login feature..."] → [Node B]
```

Used for: keeping context manageable, reducing token usage, when only the outcome matters.

### Artifacts

Pass only explicit outputs such as:
- Generated files
- Git diffs
- JSON results
- Trace references

```
[Node A] → [artifacts: diff + files] → [Node B]
```

Used for: pipeline-style workflows where each node processes the output of the previous one.

## Session Lifecycle

1. **Creation**: A session is created when a node is about to execute
2. **Context Resolution**: The runtime resolves the upstream context based on the context mode
3. **Execution**: The node executes with the resolved session context
4. **Update**: After execution, the session is updated with the node's output (summary, artifacts, diff)
5. **Passing**: The session is available for downstream nodes via the session manager

## Trace Linkage

Every session records its `traceId` and optional `parentId`, creating a directed graph of execution:

```
Trace A (Node 1)
  → Trace B (Node 2, inherits from Node 1)
    → Trace C (Node 3, inherits from Node 2)
  → Trace D (Node 4, fork from Node 1)
```

This allows full trace replay of any workflow execution path.
