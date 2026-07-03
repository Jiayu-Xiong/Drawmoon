import { describe, expect, test } from "bun:test"

import { getApiConcurrencyLimit } from "./api-concurrency.js"

describe("getApiConcurrencyLimit", () => {
  test("defaults kuaipao keys to 1", () => {
    expect(getApiConcurrencyLimit("KUAIPAO_API_KEY")).toBe(1)
    expect(getApiConcurrencyLimit("KUAIPAO_CDK_1_API_KEY")).toBe(1)
  })

  test("defaults non-kuaipao to unlimited", () => {
    expect(getApiConcurrencyLimit("DEEPSEEK_API_KEY")).toBe(-1)
  })
})
