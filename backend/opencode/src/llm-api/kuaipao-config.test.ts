import { describe, expect, test } from "bun:test"

import { loadApiFileProviderBlocks } from "./kuaipao-config.js"

describe("loadApiFileProviderBlocks", () => {
  test("assigns separate apiKeyEnv values for multiple kuaipao blocks", () => {
    const blocks = loadApiFileProviderBlocks()
    const kuaipaoBlocks = blocks.filter((block) => block.provider === "kuaipao")
    if (kuaipaoBlocks.length < 2) return

    const envs = new Set(kuaipaoBlocks.map((block) => block.apiKeyEnv))
    expect(envs.size).toBe(kuaipaoBlocks.length)
    expect(kuaipaoBlocks[0]?.apiKeyEnv).toBe("KUAIPAO_API_KEY")
    expect(kuaipaoBlocks[1]?.apiKeyEnv).toBe("KUAIPAO_CDK_1_API_KEY")
    expect(kuaipaoBlocks[0]?.id).not.toBe(kuaipaoBlocks[1]?.id)
  })
})
