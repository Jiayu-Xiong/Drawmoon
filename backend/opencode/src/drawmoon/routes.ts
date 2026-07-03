import type { Hono } from "hono"

import { readDrawmoonRegistry, writeRegistryBucket, type DrawmoonRegistryBucket } from "./registry.js"
import { readLibraryManifest, scanLibraryManifest, upsertCustomTool, upsertMcpServer, upsertSkill } from "./library.js"
import { buildToolCatalog, CUSTOM_TOOL_HANDLER_EXAMPLE, CUSTOM_TOOL_PARAMETER_EXAMPLE } from "./tool-catalog.js"
import { importLibraryZip } from "./library-import.js"
import { ensureIsolationSmokeLibrary } from "./isolation-smoke-library.js"
import { drawmoonRoot } from "./paths.js"
import { listDrawmoonNodeTemplateIds, listDrawmoonWorkflowTemplateMetas, readDrawmoonNodeTemplate, readDrawmoonWorkflowTemplate, writeDrawmoonWorkflowTemplate } from "./workflow-templates.js"
import { validateWorkflowUiTemplate } from "./template-validator.js"
import { seedRepoWorkflowTemplates } from "./workflow-template-seed.js"
import { rebindAllDrawmoonWorkflowTemplates } from "./rebind-workflow-templates-batch.js"
import { listDrawmoonProfiles, readDrawmoonProfile } from "./profiles.js"

export function registerDrawmoonRoutes(app: Hono) {
  app.get("/drawmoon/root", (c) => c.json({ root: drawmoonRoot() }))

  app.get("/drawmoon/registry", (c) => c.json(readDrawmoonRegistry()))

  app.put("/drawmoon/registry/:bucket", async (c) => {
    const bucket = c.req.param("bucket") as DrawmoonRegistryBucket
    if (!["cli-templates", "agent-mode-templates", "llm-api-templates"].includes(bucket)) {
      return c.json({ error: "unknown registry bucket" }, 400)
    }
    const body = await c.req.json().catch(() => null) as { items?: unknown[] } | null
    if (!body || !Array.isArray(body.items)) return c.json({ error: "items array required" }, 400)
    return c.json(writeRegistryBucket(bucket, body.items))
  })

  app.get("/library/manifest", (c) => c.json(readLibraryManifest()))

  app.get("/library/tool-catalog", (c) => c.json(buildToolCatalog()))

  app.post("/library/rescan", (c) => c.json(scanLibraryManifest()))

  app.post("/library/import", async (c) => {
    const form = await c.req.formData().catch(() => null)
    const file = form?.get("archive")
    if (!(file instanceof File)) return c.json({ error: "archive file required (multipart field: archive)" }, 400)
    if (!file.name.toLowerCase().endsWith(".zip")) return c.json({ error: "only .zip archives are supported" }, 400)
    const buffer = new Uint8Array(await file.arrayBuffer())
    if (!buffer.length) return c.json({ error: "empty archive" }, 400)
    try {
      return c.json(importLibraryZip(buffer))
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400)
    }
  })

  app.post("/library/seed/tool-isolation-smoke", (c) => c.json(ensureIsolationSmokeLibrary({ force: true })))

  app.post("/library/skills", async (c) => {
    const body = await c.req.json().catch(() => null) as { id?: string; name?: string; body?: string } | null
    if (!body?.name?.trim() || !body?.body?.trim()) return c.json({ error: "name and body required" }, 400)
    return c.json(upsertSkill(body.id ?? body.name, body.name.trim(), body.body))
  })

  app.post("/library/mcp", async (c) => {
    const body = await c.req.json().catch(() => null) as { id?: string; config?: Record<string, unknown> } | null
    if (!body?.config || typeof body.config !== "object") return c.json({ error: "config object required" }, 400)
    const id = body.id ?? (typeof body.config.name === "string" ? body.config.name : "mcp-server")
    return c.json(upsertMcpServer(id, body.config))
  })

  app.get("/library/custom-tool-spec", (c) => c.json({
    kinds: [
      { id: "delegate", description: "Map to an existing OpenCode builtin (read, bash, …). No code required." },
      { id: "opencode-plugin", description: "Generate OpenCode plugin tool (.ts) with parameters + execute handler." },
      { id: "spec-only", description: "Register tool id + description only (prompt contract)." },
    ],
    parameterExample: CUSTOM_TOOL_PARAMETER_EXAMPLE,
    handlerExample: CUSTOM_TOOL_HANDLER_EXAMPLE,
    opencodeToolTemplate: `import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "...",
  args: { path: tool.schema.string().describe("...") },
  async execute(args) {
    return "result"
  },
})`,
  }))

  app.post("/library/tools", async (c) => {
    const body = await c.req.json().catch(() => null) as {
      id?: string
      name?: string
      description?: string
      opencodeToolId?: string | null
      kind?: "delegate" | "opencode-plugin" | "spec-only"
      parameters?: Array<{ name: string; type?: string; required?: boolean; description?: string }>
      inputSchema?: Record<string, unknown>
      handlerCode?: string
    } | null
    if (!body?.name?.trim()) return c.json({ error: "name required" }, 400)
    if (body.kind === "opencode-plugin" && !body.handlerCode?.trim()) {
      return c.json({ error: "handlerCode required for opencode-plugin tools" }, 400)
    }
    return c.json(upsertCustomTool({
      id: body.id,
      name: body.name.trim(),
      description: body.description,
      opencodeToolId: body.opencodeToolId,
      kind: body.kind,
      parameters: body.parameters,
      inputSchema: body.inputSchema,
      handlerCode: body.handlerCode,
    }))
  })

  app.get("/drawmoon/templates/workflows", (c) => {
    return c.json({ templates: listDrawmoonWorkflowTemplateMetas() })
  })

  app.get("/drawmoon/templates/workflows/:id", (c) => {
    const template = readDrawmoonWorkflowTemplate(c.req.param("id"))
    if (!template) return c.json({ error: "workflow template not found" }, 404)
    return c.json({ template })
  })

  app.post("/drawmoon/templates/workflows/rebind", (c) => {
    return c.json(rebindAllDrawmoonWorkflowTemplates())
  })

  app.post("/drawmoon/templates/workflows/seed", (c) => {
    const force = c.req.query("force") === "true"
    return c.json(seedRepoWorkflowTemplates({ force }))
  })

  app.post("/drawmoon/templates/workflows/validate", async (c) => {
    const body = await c.req.json().catch(() => null) as { template?: Record<string, unknown> } | null
    if (!body?.template || typeof body.template !== "object") {
      return c.json({ error: "template object required" }, 400)
    }
    return c.json(validateWorkflowUiTemplate(body.template))
  })

  app.post("/drawmoon/templates/workflows", async (c) => {
    const body = await c.req.json().catch(() => null) as { template?: Record<string, unknown> } | null
    if (!body?.template || typeof body.template !== "object") {
      return c.json({ error: "template object required" }, 400)
    }
    try {
      const meta = writeDrawmoonWorkflowTemplate(body.template)
      return c.json({ meta, template: readDrawmoonWorkflowTemplate(meta.id) })
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400)
    }
  })

  app.get("/drawmoon/templates/nodes", (c) => {
    return c.json({ ids: listDrawmoonNodeTemplateIds() })
  })

  app.get("/drawmoon/templates/nodes/*", (c) => {
    const id = c.req.path.replace(/^.*\/drawmoon\/templates\/nodes\//, "")
    const node = readDrawmoonNodeTemplate(id)
    if (!node) return c.json({ error: "node template not found" }, 404)
    return c.json({ node })
  })

  app.get("/drawmoon/templates/profiles", (c) => {
    return c.json({ profiles: listDrawmoonProfiles() })
  })

  app.get("/drawmoon/templates/profiles/:id", (c) => {
    const profile = readDrawmoonProfile(c.req.param("id"))
    if (!profile) return c.json({ error: "profile not found" }, 404)
    return c.json({ profile })
  })
}
