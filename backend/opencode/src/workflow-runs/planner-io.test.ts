import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

import type { WorkflowGraph } from "../schema/types.js"
import { parseAllocationPlan, writeAllocationPlanEntity } from "./allocator/parse.js"
import { validateAllocationPlan } from "./allocator/validate.js"
import { migrateProducerOutputs, moveWithinWorkspace } from "./allocator/migrate.js"
import { handlePostNodeComplete } from "./runner/node-complete-handler.js"
import { Blackboard } from "./context/blackboard.js"
import { transportArtifactsFromManifest } from "./artifact-transport.js"

const RUN_ID = "01TESTRUN000000000000000001"

describe("IO collaboration planner", () => {
  const graph: WorkflowGraph = {
    nodes: [
      { id: "io-planner", label: "Planner", config: { provider: "opencode", mode: "build", cwd: ".", prompt: "", contextMode: "fresh" }, metadata: { archetype: "planner" } },
      { id: "section-intro", label: "Intro", config: { provider: "opencode", mode: "build", cwd: ".", prompt: "", contextMode: "fresh" }, metadata: { archetype: "worker" } },
    ],
    edges: [{ from: "io-planner", to: "section-intro" }],
  }

  test("parseAllocationPlan extracts IO collaboration JSON", () => {
    const text = 'Plan\n```json\n{"writeRoot":".","folders":["out"],"files":[{"flat":"a.md","dest":"out/a.md","producer":"section-intro"}]}\n```'
    const plan = parseAllocationPlan(text)
    expect(plan?.files[0]?.dest).toBe("out/a.md")
  })

  test("validateAllocationPlan rejects unknown producer", () => {
    const plan = {
      writeRoot: ".",
      folders: ["out"],
      files: [{ flat: "a.md", dest: "out/a.md", producer: "ghost-node" }],
    }
    const result = validateAllocationPlan(plan, graph)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes("ghost-node"))).toBe(true)
  })

  test("validateAllocationPlan rejects duplicate dest", () => {
    const plan = {
      writeRoot: ".",
      folders: ["out"],
      files: [
        { flat: "a.md", dest: "out/a.md", producer: "section-intro" },
        { flat: "b.md", dest: "out/a.md", producer: "section-intro" },
      ],
    }
    expect(validateAllocationPlan(plan, graph).ok).toBe(false)
  })

  test("planner complete writes allocation plan and creates folders", () => {
    const root = join(tmpdir(), `wf-planner-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const text = '```json\n{"writeRoot":".","folders":["paper"],"files":[{"flat":"intro.md","dest":"paper/intro.md","producer":"section-intro","criticality":"critical"}]}\n```'
    const result = handlePostNodeComplete({
      workspaceDir: root,
      node: graph.nodes[0]!,
      graph,
      blackboard: new Blackboard(root),
      nodeStartMs: Date.now(),
      cleanedText: text,
      runId: RUN_ID,
    })
    expect(result.repairMsg).toBeUndefined()
    expect(existsSync(join(root, ".workflow/allocation-plan.json"))).toBe(true)
    expect(existsSync(join(root, "paper"))).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })

  test("worker migrate moves flat file to dest", () => {
    const root = join(tmpdir(), `wf-migrate-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const plan = {
      writeRoot: ".",
      folders: ["paper"],
      files: [{ flat: "intro.md", dest: "paper/intro.md", producer: "section-intro", criticality: "critical" }],
    }
    writeAllocationPlanEntity(root, plan)
    writeFileSync(join(root, "intro.md"), "# Intro", "utf-8")
    const migration = migrateProducerOutputs(root, plan, "section-intro", "# Intro")
    expect(migration.missing).toHaveLength(0)
    expect(existsSync(join(root, "paper/intro.md"))).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })

  test("worker missing flat file triggers needs-repair", () => {
    const root = join(tmpdir(), `wf-missing-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    writeAllocationPlanEntity(root, {
      writeRoot: ".",
      folders: ["paper"],
      files: [{ flat: "intro.md", dest: "paper/intro.md", producer: "section-intro", criticality: "critical" }],
    })
    const result = handlePostNodeComplete({
      workspaceDir: root,
      node: graph.nodes[1]!,
      graph,
      blackboard: new Blackboard(root),
      nodeStartMs: Date.now(),
      cleanedText: "",
      runId: RUN_ID,
    })
    expect(result.repairMsg).toMatch(/needs-repair.*paper\/intro\.md/)
    rmSync(root, { recursive: true, force: true })
  })

  test("plannerInquiry pauses when questions file exists without reply", () => {
    const root = join(tmpdir(), `wf-inquiry-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const nodeStartMs = Date.now()
    writeFileSync(join(root, "planner-inquiry-questions.md"), "1. Question?", "utf-8")
    const plannerNode = {
      id: "io-planner",
      label: "Planner",
      config: { provider: "opencode", mode: "plan", cwd: ".", prompt: "", contextMode: "fresh" },
      metadata: { archetype: "planner", plannerInquiry: true },
    }
    const result = handlePostNodeComplete({
      workspaceDir: root,
      node: plannerNode as typeof graph.nodes[0],
      graph,
      blackboard: new Blackboard(root),
      nodeStartMs,
      cleanedText: "Wrote questions only.",
      runId: RUN_ID,
    })
    expect(result.inquiryPause).toBe(true)
    expect(result.inquiryQuestionsText).toContain("Question?")
    expect(result.repairMsg).toBeUndefined()
    rmSync(root, { recursive: true, force: true })
  })

  test("plannerInquiry ignores stale questions from prior run", () => {
    const root = join(tmpdir(), `wf-inquiry-stale-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, "planner-inquiry-questions.md"), "1. Old question?", "utf-8")
    const plannerNode = {
      id: "io-planner",
      label: "Planner",
      config: { provider: "opencode", mode: "plan", cwd: ".", prompt: "", contextMode: "fresh" },
      metadata: { archetype: "planner", plannerInquiry: true },
    }
    const result = handlePostNodeComplete({
      workspaceDir: root,
      node: plannerNode as typeof graph.nodes[0],
      graph,
      blackboard: new Blackboard(root),
      nodeStartMs: Date.now() + 60_000,
      cleanedText: "No plan yet.",
      runId: RUN_ID,
    })
    expect(result.inquiryPause).toBeUndefined()
    expect(result.repairMsg).toMatch(/needs-repair/)
    rmSync(root, { recursive: true, force: true })
  })

  test("plannerInquiry blocks IO JSON before authorized author reply", () => {
    const root = join(tmpdir(), `wf-inquiry-plan-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const nodeStartMs = Date.now()
    writeFileSync(join(root, "planner-inquiry-questions.md"), "1. Question?", "utf-8")
    const plannerNode = {
      id: "io-planner",
      label: "Planner",
      config: { provider: "opencode", mode: "plan", cwd: ".", prompt: "", contextMode: "fresh" },
      metadata: { archetype: "planner", plannerInquiry: true },
    }
    const text = '```json\n{"writeRoot":".","folders":["paper"],"files":[{"flat":"intro.md","dest":"paper/intro.md","producer":"section-intro"}]}\n```'
    const result = handlePostNodeComplete({
      workspaceDir: root,
      node: plannerNode as typeof graph.nodes[0],
      graph,
      blackboard: new Blackboard(root),
      nodeStartMs,
      cleanedText: text,
      runId: RUN_ID,
    })
    expect(result.inquiryPause).toBe(true)
    expect(result.repairMsg).toBeUndefined()
    rmSync(root, { recursive: true, force: true })
  })

  test("worker migrate replaces planner shell at dest", () => {
    const root = join(tmpdir(), `wf-shell-${Date.now()}`)
    mkdirSync(join(root, "paper"), { recursive: true })
    const plan = {
      writeRoot: ".",
      folders: ["paper"],
      files: [{ flat: "intro.md", dest: "paper/intro.md", producer: "section-intro", criticality: "critical" }],
    }
    writeFileSync(join(root, "paper", "intro.md"), "\\section{Shell}\n% placeholder\n", "utf-8")
    writeFileSync(join(root, "intro.md"), "# Full intro\n\nLong body from section worker.\n", "utf-8")
    const migration = migrateProducerOutputs(root, plan, "section-intro", "# Full intro")
    expect(migration.missing).toHaveLength(0)
    expect(readFileSync(join(root, "paper", "intro.md"), "utf-8")).toContain("Long body")
    rmSync(root, { recursive: true, force: true })
  })

  test("worker migrate replaces planner shell at dest", () => {
    const root = join(tmpdir(), `wf-shell-${Date.now()}`)
    mkdirSync(join(root, "paper"), { recursive: true })
    const plan = {
      writeRoot: ".",
      folders: ["paper"],
      files: [{ flat: "intro.md", dest: "paper/intro.md", producer: "section-intro", criticality: "critical" }],
    }
    writeFileSync(join(root, "paper", "intro.md"), "\\section{Shell}\n% placeholder\n", "utf-8")
    writeFileSync(join(root, "intro.md"), "# Full intro\n\nLong body from section worker.\n", "utf-8")
    const migration = migrateProducerOutputs(root, plan, "section-intro", "# Full intro")
    expect(migration.missing).toHaveLength(0)
    expect(readFileSync(join(root, "paper", "intro.md"), "utf-8")).toContain("Long body")
    rmSync(root, { recursive: true, force: true })
  })

  test("moveWithinWorkspace renames file", () => {
    const root = join(tmpdir(), `wf-move-${Date.now()}`)
    mkdirSync(join(root, "dest"), { recursive: true })
    writeFileSync(join(root, "src.md"), "body", "utf-8")
    moveWithinWorkspace(join(root, "src.md"), join(root, "dest", "out.md"))
    expect(existsSync(join(root, "dest", "out.md"))).toBe(true)
    expect(readFileSync(join(root, "dest", "out.md"), "utf-8")).toBe("body")
    rmSync(root, { recursive: true, force: true })
  })

  test("transportArtifactsFromManifest uses move semantics", () => {
    const root = join(tmpdir(), `wf-transport-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const started = Date.now()
    writeFileSync(join(root, "stray.md"), "hello", "utf-8")
    const manifest = { files: [{ path: "plans/stray.md", source: "stray.md" }] }
    const result = transportArtifactsFromManifest(root, manifest, started)
    expect(result.moved.length).toBe(1)
    expect(existsSync(join(root, "plans/stray.md"))).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })
})
