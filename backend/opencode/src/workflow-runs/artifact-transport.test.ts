import { describe, expect, test } from "bun:test"
import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { parsePlannerManifest, transportArtifactsFromManifest, writePlannerManifestEntity } from "./artifact-transport.js"

describe("artifact-transport", () => {
  const root = join(tmpdir(), `wf-transport-${Date.now()}`)

  test("parsePlannerManifest extracts json fence", () => {
    const text = 'Plan...\n```json\n{"files":[{"path":"out/a.md"}]}\n```'
    const m = parsePlannerManifest(text)
    expect(m?.files[0]?.path).toBe("out/a.md")
  })

  test("transportArtifactsFromManifest moves root file to manifest path", () => {
    mkdirSync(root, { recursive: true })
    const started = Date.now()
    writeFileSync(join(root, "stray.md"), "hello", "utf-8")
    const manifest = { files: [{ path: "plans/stray.md", source: "stray.md" }] }
    writePlannerManifestEntity(root, manifest)
    const result = transportArtifactsFromManifest(root, manifest, started)
    expect(result.moved.length).toBe(1)
    rmSync(root, { recursive: true, force: true })
  })
})
