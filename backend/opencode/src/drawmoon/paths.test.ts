import { describe, expect, test } from "bun:test"
import { join } from "node:path"

import { drawmoonRuntimeDir, resolveRuntimeDataDir } from "./paths"

describe("resolveRuntimeDataDir", () => {
  test("defaults to ~/.drawmoon/runtime", () => {
    expect(resolveRuntimeDataDir()).toBe(drawmoonRuntimeDir())
    expect(resolveRuntimeDataDir("")).toBe(drawmoonRuntimeDir())
  })

  test("allows subpaths under ~/.drawmoon", () => {
    const nested = join(drawmoonRuntimeDir(), "test-nested")
    expect(resolveRuntimeDataDir(nested)).toBe(nested)
  })

  test("rejects repo-local ./data", () => {
    expect(() => resolveRuntimeDataDir("./data")).toThrow(/~\/\.drawmoon/)
  })
})
