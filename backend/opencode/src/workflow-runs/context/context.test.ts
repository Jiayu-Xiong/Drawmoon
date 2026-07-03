import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { blockingMissing, computeConsumedKeys } from "./consumers.js"
import { sliceByAnchor, normalizeHandoff } from "./handoff.js"
import { Blackboard } from "./blackboard.js"
import { reconcileNodeOutputs, restoreFromText } from "./reconcile.js"
import { createInputDescriptor, describeInputDescriptor } from "./delivery/input-descriptor.js"
import { resolveDelegateCapability, providerSupportsInputKind } from "./delivery/delegate-capability.js"
import { planNodeDelivery } from "./delivery/strategies.js"
import { resolveTransportMode } from "./transport.js"
import { resolveInteractionIntent } from "./archetypes.js"
import { validateWorkflowUiTemplate } from "../../drawmoon/template-validator.js"
import type { AgentNodeConfig, WorkflowGraph } from "../../schema/types.js"

describe("restoreFromText", () => {
  test("extracts latex fenced block", () => {
    const text = "done\n```latex\n\\section{Intro}\n```"
    expect(restoreFromText(text, "out.tex")).toBe("\\section{Intro}")
  })

  test("returns md body", () => {
    expect(restoreFromText("# Title\nbody", "doc.md")).toContain("Title")
  })
})

describe("sliceByAnchor", () => {
  test("slices by heading", () => {
    const md = "# A\none\n\n# B\ntwo"
    expect(sliceByAnchor(md, "B")).toContain("two")
  })

  test("normalizeHandoff adds keys front-matter", () => {
    const out = normalizeHandoff("# Foo\nbar")
    expect(out).toContain("keys:")
    expect(out).toContain("anchor: Foo")
  })
})

describe("computeConsumedKeys", () => {
  const graph: WorkflowGraph = {
    nodes: [
      { id: "planner", label: "P", config: { provider: "opencode", mode: "build", cwd: ".", prompt: "", contextMode: "fresh" }, metadata: { contract: { outputs: [{ key: "arch", path: "a.md" }] } } },
      { id: "worker", label: "W", config: { provider: "opencode", mode: "build", cwd: ".", prompt: "", contextMode: "fresh" }, metadata: { contract: { inputs: [{ key: "x", from: "planner:arch", required: true }] }, readRunFiles: ["b.md"] } },
    ],
    edges: [{ from: "planner", to: "worker", contextMode: "artifacts" }],
  }

  test("collects keys and readRunFiles paths", () => {
    const c = computeConsumedKeys(graph)
    expect(c.keys.has("arch")).toBe(true)
    expect(c.paths.has("b.md")).toBe(true)
  })

  test("blockingMissing detects downstream consumer", () => {
    expect(blockingMissing(graph, "planner", [{ key: "arch", path: "a.md" }]).length).toBe(1)
    expect(blockingMissing(graph, "planner", [{ key: "unused", path: "z.md" }]).length).toBe(0)
  })
})

describe("reconcileNodeOutputs order", () => {
  const root = join(tmpdir(), `wf-reconcile-${Date.now()}`)
  mkdirSync(root, { recursive: true })

  test("restores from text when file missing", () => {
    const node = {
      id: "section-intro",
      label: "intro",
      config: { provider: "opencode", mode: "build", cwd: root, prompt: "", contextMode: "fresh" },
      metadata: {
        archetype: "worker",
        contract: { outputs: [{ key: "intro", path: "sections/01-intro.tex" }] },
      },
    }
    const bb = new Blackboard(root)
    const text = "```latex\n\\section{Intro}\n```"
    const result = reconcileNodeOutputs(root, node, bb, Date.now(), text)
    expect(result.ok).toBe(true)
    expect(existsSync(join(root, "sections/01-intro.tex"))).toBe(true)
    expect(readFileSync(join(root, "sections/01-intro.tex"), "utf-8")).toContain("Intro")
    rmSync(root, { recursive: true, force: true })
  })
})

describe("InputDescriptor", () => {
  test("classifies pdf without reading body", () => {
    const desc = createInputDescriptor("paper", { path: "paper.pdf", exists: true })
    expect(desc.kind).toBe("pdf")
    const line = describeInputDescriptor(desc)
    expect(line).toContain("PDF")
    expect(line).not.toContain("%PDF")
  })

  test("classifies image", () => {
    const desc = createInputDescriptor("fig", { path: "fig.png", exists: true })
    expect(desc.kind).toBe("image")
  })
})

describe("DeliveryPlanner", () => {
  const root = join(tmpdir(), `wf-delivery-${Date.now()}`)
  mkdirSync(root, { recursive: true })

  test("CLI path reference for pdf", () => {
    writeFileSync(join(root, "paper.pdf"), "%PDF-1.4 fake")
    const node = {
      id: "review",
      label: "Review",
      config: { provider: "opencode", mode: "review", cwd: root, prompt: "审稿", contextMode: "fresh" },
      metadata: { archetype: "reviewer", readRunFiles: ["paper.pdf"] },
    }
    const config: AgentNodeConfig = { ...node.config }
    const plan = planNodeDelivery(root, node, config, new Blackboard(root))
    expect(plan.promptSuffix).toContain("paper.pdf")
    expect(plan.promptSuffix).toContain("PDF")
    expect(plan.promptSuffix).not.toContain("%PDF")
    expect(plan.attachments.some((a) => a.kind === "path" && a.path === "paper.pdf")).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })

  test("skips missing readRunFiles in input manifest", () => {
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, "draft.pdf"), "%PDF-1.4 fake")
    const node = {
      id: "review",
      label: "Review",
      config: { provider: "kiro", mode: "review", cwd: root, prompt: "review", contextMode: "fresh" },
      metadata: {
        archetype: "reviewer",
        readRunFiles: ["iclr2026/build/round1.pdf", "iclr2026/build/draft.pdf"],
      },
    }
    const plan = planNodeDelivery(root, node, node.config, new Blackboard(root))
    expect(plan.promptSuffix).toContain("draft.pdf")
    expect(plan.promptSuffix).not.toContain("round1.pdf")
    rmSync(root, { recursive: true, force: true })
  })

  test("API vision base64 for image", () => {
    mkdirSync(root, { recursive: true })
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    writeFileSync(join(root, "chart.png"), png)
    const node = {
      id: "vision",
      label: "Vision",
      config: {
        provider: "custom",
        mode: "chat",
        cwd: root,
        prompt: "describe",
        contextMode: "fresh",
        llmApi: { endpoint: "https://api.example/v1", model: "gpt-4o" },
      },
      metadata: { readRunFiles: ["chart.png"] },
    }
    const plan = planNodeDelivery(root, node, node.config, new Blackboard(root))
    const img = plan.attachments.find((a) => a.kind === "image")
    expect(img?.base64).toBeTruthy()
    rmSync(root, { recursive: true, force: true })
  })
})

describe("resolveTransportMode", () => {
  const graph: WorkflowGraph = {
    nodes: [{ id: "r", label: "R", config: { provider: "opencode", mode: "review", cwd: ".", prompt: "", contextMode: "fresh" }, metadata: { archetype: "reviewer", readRunFiles: ["paper.pdf"] } }],
    edges: [],
  }

  test("reviewer forces fresh and skipUpstream", () => {
    const node = graph.nodes[0]!
    const config = node.config
    const result = resolveTransportMode(node, config, graph, undefined)
    expect(result.edgeContextMode).toBe("fresh")
    expect(result.skipUpstream).toBe(true)
  })
})

describe("resolveInteractionIntent", () => {
  test("reviewer defaults to review", () => {
    expect(resolveInteractionIntent("reviewer")).toBe("review")
  })
  test("reviser defaults to continue", () => {
    expect(resolveInteractionIntent("reviser")).toBe("continue")
  })
})

describe("validateWorkflowUiTemplate isolation", () => {
  test("reviewer inherit edge is error", () => {
    const template = {
      id: "t",
      name: "T",
      stages: [{ id: "s1" }],
      columns: [{ id: "c1", lanes: [{ id: "l1", nodeIds: ["author", "review"] }] }],
      nodes: [
        { id: "author", name: "A", promptPreview: "write", executionMode: "cli", agentModeTemplateId: "opencode-chat", runtimeOverrides: { archetype: "worker", contextMode: "fresh" }, artifacts: [{ path: "paper.pdf" }] },
        { id: "review", name: "R", promptPreview: "审稿", executionMode: "cli", agentModeTemplateId: "opencode-chat", runtimeOverrides: { archetype: "reviewer", contextMode: "fresh", readRunFiles: ["paper.pdf"] } },
      ],
      edges: [{ from: "author", to: "review", contextMode: "inherit" }],
      sharedSessions: [],
      sessionGroups: {},
      loopEdges: [],
      branchGroups: [],
      mergeGroups: [],
    }
    const result = validateWorkflowUiTemplate(template)
    expect(result.errors.some((e) => e.includes("reviewers must not inherit"))).toBe(true)
  })
})

describe("delegate capability", () => {
  test("opencode supports pdf via path", () => {
    const caps = resolveDelegateCapability({ provider: "opencode", mode: "build", cwd: ".", prompt: "", contextMode: "fresh" })
    expect(providerSupportsInputKind(caps, "pdf")).toBe(true)
  })

  test("copilot does not support pdf", () => {
    const caps = resolveDelegateCapability({ provider: "copilot", mode: "chat", cwd: ".", prompt: "", contextMode: "fresh" })
    expect(providerSupportsInputKind(caps, "pdf")).toBe(false)
  })
})
