/** Normalize provider/model labels — fixes mistaken 「路」 separator and middle dots. */
export function sanitizeDisplayLabel(value: string) {
  return value
    .replace(/\u8def/g, "/")
    .replace(/[·•]/g, "/")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s{2,}/g, " ")
    .trim()
}

export function formatProviderModelLabel(provider: string, model: string) {
  return sanitizeDisplayLabel(`${provider} / ${model}`)
}
