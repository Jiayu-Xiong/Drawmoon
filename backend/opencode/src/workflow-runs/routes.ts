import { Hono } from "hono"
import { stream } from "hono/streaming"

import type { WorkflowGraph } from "../schema/types.js"
import { resolveTemplateGraph } from "../workflow-templates/index.js"
import type { FileWorkflowRunEventLog } from "./events.js"
import type { FileWorkflowRunStore } from "./store.js"
import type { WorkflowRunRunner } from "./runner.js"
import { toLightWorkflowRunRecord } from "./run-sanitize.js"
import { listWorkflowUsageEvents } from "./usage-events.js"
import type { WorkflowRunStoredEvent } from "./types.js"

export interface WorkflowRunRoutesOptions {
  store: FileWorkflowRunStore
  events: FileWorkflowRunEventLog
  runner: WorkflowRunRunner
  onRunStarted?: (runId: string) => void
}

export abstract class WorkflowRunRoutesBase {
  abstract toApp(): Hono
}

export class WorkflowRunRoutes extends WorkflowRunRoutesBase {
  private store: FileWorkflowRunStore
  private events: FileWorkflowRunEventLog
  private runner: WorkflowRunRunner
  private onRunStarted?: (runId: string) => void

  constructor(options: WorkflowRunRoutesOptions) {
    super()
    this.store = options.store
    this.events = options.events
    this.runner = options.runner
    this.onRunStarted = options.onRunStarted
  }

  toApp(): Hono {
    const app = new Hono()

    app.post("/workflow-runs", async (c) => {
      const body = await c.req.json()
      let graph = body.graph as WorkflowGraph | undefined
      const templateId = body.templateId as string | undefined

      // Resolve graph from template if only templateId is provided
      if (!graph && templateId) {
        graph = resolveTemplateGraph(templateId)
        if (!graph) return c.json({ error: `Template not found: ${templateId}` }, 404)
      }

      if (!graph) return c.json({ error: "graph or templateId is required" }, 400)

      const run = this.runner.startWorkflowRun(graph, {
        templateId,
        templateVersion: body.templateVersion,
        name: body.name,
        prompt: body.prompt,
        defaultLabel: body.defaultLabel,
        labels: Array.isArray(body.labels) ? body.labels : undefined,
        selectedAgentModes: body.selectedAgentModes,
        readDirectory: typeof body.readDirectory === "string" ? body.readDirectory : undefined,
        readRoots: Array.isArray(body.readRoots)
          ? body.readRoots.filter((v): v is string => typeof v === "string")
          : undefined,
        bypassCache: body.bypassCache === true,
        budgetOverride: body.budgetOverride === true,
        budgetBlocked: body.budgetBlocked === true,
        budgetBlockReason: typeof body.budgetBlockReason === "string" ? body.budgetBlockReason : undefined,
        workflowTemplateSnapshot: body.workflowTemplateSnapshot && typeof body.workflowTemplateSnapshot === "object"
          ? body.workflowTemplateSnapshot as Record<string, unknown>
          : undefined,
      })
      this.onRunStarted?.(run.id)
      return c.json({ run }, 201)
    })

    app.get("/workflow-runs", (c) => c.json({ runs: this.store.listLightweight() }))

    app.get("/workflow-usage/events", (c) => {
      const limit = Number(c.req.query("limit") ?? "20")
      const result = listWorkflowUsageEvents(this.store, {
        limit: Number.isFinite(limit) ? limit : 20,
        templateId: c.req.query("templateId") || undefined,
        runId: c.req.query("runId") || undefined,
        since: c.req.query("since") || undefined,
        until: c.req.query("until") || undefined,
        cli: c.req.query("cli") || undefined,
        api: c.req.query("api") || undefined,
        agentMode: c.req.query("agentMode") || undefined,
      })
      return c.json(result)
    })

    app.delete("/workflow-runs/:id", (c) => {
      const ok = this.store.delete(c.req.param("id"))
      if (!ok) return c.json({ error: "Workflow run not found" }, 404)
      return c.json({ deleted: c.req.param("id") })
    })

    app.get("/workflow-runs/:id", (c) => {
      const run = this.store.get(c.req.param("id"))
      if (!run) return c.json({ error: "Workflow run not found" }, 404)
      const view = c.req.query("view")
      if (view === "light") {
        return c.json({ run: toLightWorkflowRunRecord(run) })
      }
      return c.json({ run })
    })

    app.patch("/workflow-runs/:id/labels", async (c) => {
      const body = await c.req.json()
      const labels = Array.isArray(body.labels) ? body.labels.filter((item: unknown) => typeof item === "string") : []
      const defaultLabel = typeof body.defaultLabel === "string" ? body.defaultLabel : undefined
      const run = this.store.updateLabels(c.req.param("id"), labels, defaultLabel)
      if (!run) return c.json({ error: "Workflow run not found" }, 404)
      return c.json({ run })
    })

    app.patch("/workflow-runs/:id", async (c) => {
      const body = await c.req.json()
      const labels = Array.isArray(body.labels) ? body.labels.filter((item: unknown) => typeof item === "string") : undefined
      const run = this.store.updateMetadata(c.req.param("id"), {
        name: typeof body.name === "string" ? body.name : undefined,
        defaultLabel: typeof body.defaultLabel === "string" ? body.defaultLabel : undefined,
        labels,
      })
      if (!run) return c.json({ error: "Workflow run not found" }, 404)
      return c.json({ run })
    })

    app.get("/workflow-runs/:id/events", (c) => {
      const id = c.req.param("id")
      if (!this.store.get(id)) return c.json({ error: "Workflow run not found" }, 404)
      return c.json({ events: this.events.read(id) })
    })

    app.get("/workflow-runs/:id/stream", (c) => {
      const id = c.req.param("id")
      if (!this.store.get(id)) return c.json({ error: "Workflow run not found" }, 404)
      return stream(c, async (output) => {
        for (const event of this.events.read(id)) {
          await output.write(JSON.stringify(event) + "\n")
          if (this.isTerminalEvent(event)) return
        }

        await new Promise<void>((resolve) => {
          const unsubscribe = this.events.subscribe(id, (event) => {
            void output.write(JSON.stringify(event) + "\n")
            if (this.isTerminalEvent(event)) {
              unsubscribe()
              resolve()
            }
          })
          output.onAbort(() => {
            unsubscribe()
            resolve()
          })
        })
      })
    })

    app.post("/workflow-runs/:id/cancel", (c) => {
      const run = this.runner.cancelWorkflowRun(c.req.param("id"))
      if (!run) return c.json({ error: "Workflow run not found" }, 404)
      return c.json({ run })
    })

    app.post("/workflow-runs/:id/pause", (c) => {
      const run = this.runner.pauseWorkflowRun(c.req.param("id"))
      if (!run) return c.json({ error: "Workflow run not found" }, 404)
      return c.json({ run })
    })

    app.post("/workflow-runs/:id/interrupt", (c) => {
      const run = this.runner.interruptWorkflowRun(c.req.param("id"))
      if (!run) return c.json({ error: "Workflow run not found" }, 404)
      return c.json({ run })
    })

    app.post("/workflow-runs/:id/continue", async (c) => {
      const body = await c.req.json().catch(() => ({}))
      const inquiryReply = typeof body.inquiryReply === "string" ? body.inquiryReply : undefined
      const run = this.runner.continueWorkflowRun(c.req.param("id"), { inquiryReply })
      if (!run) return c.json({ error: "Workflow run not found or not paused for review" }, 404)
      this.onRunStarted?.(run.id)
      return c.json({ run })
    })

    app.post("/workflow-runs/:id/retry-node", async (c) => {
      const body = await c.req.json()
      const nodeId = body.nodeId as string | undefined
      if (!nodeId) return c.json({ error: "nodeId is required" }, 400)
      const run = this.runner.retryNode(c.req.param("id"), nodeId)
      if (!run) return c.json({ error: "Workflow run or node not found" }, 404)
      return c.json({ run })
    })

    app.get("/agent-modes", async (c) => {
      const agentModes = await this.loadAgentModes()
      return c.json({ agentModes })
    })

    app.get("/agent-modes/:id", async (c) => {
      const mode = (await this.loadAgentModes()).find((item) => item.id === c.req.param("id"))
      if (!mode) return c.json({ error: "Agent mode not found" }, 404)
      return c.json({ agentMode: mode })
    })

    app.post("/agent-modes/resolve", async (c) => {
      const module = await this.loadAgentModeModule()
      if (!module?.resolveAgentModeConfig) return c.json({ error: "Agent mode resolver not available" }, 404)
      const body = await c.req.json()
      return c.json(module.resolveAgentModeConfig(body))
    })

    return app
  }

  private isTerminalEvent(event: WorkflowRunStoredEvent): boolean {
    return event.type === "workflow_completed" || event.type === "workflow_failed" || event.type === "workflow_cancelled"
  }

  private async loadAgentModes(): Promise<Array<{ id: string; [key: string]: unknown }>> {
    const module = await this.loadAgentModeModule()
    const modes = module?.defaultAgentModes ?? module?.DEFAULT_AGENT_MODES ?? []
    if (!Array.isArray(modes)) return []
    return modes.map((mode) => typeof mode?.toTemplate === "function" ? mode.toTemplate() : mode)
  }

  private async loadAgentModeModule(): Promise<Record<string, any> | null> {
    try {
      const modulePath = "../agent-modes/index.js"
      return await import(modulePath)
    } catch {
      return null
    }
  }
}
