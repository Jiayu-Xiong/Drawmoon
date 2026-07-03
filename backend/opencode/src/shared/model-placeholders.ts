/** Shared model placeholder detection for frontend/backend coercion. */
const MODEL_PLACEHOLDER = /inherited|configured-default|workflow-selected|^default$/i

export function isModelPlaceholder(model?: string | null): boolean {
  const trimmed = model?.trim()
  return !trimmed || MODEL_PLACEHOLDER.test(trimmed)
}

export function firstUsableModelValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue
    const trimmed = value.trim()
    if (isModelPlaceholder(trimmed)) continue
    return trimmed
  }
  return undefined
}
