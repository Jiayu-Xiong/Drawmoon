export interface TemplateRegistry<T> {
  register(item: T): void
  unregister(id: string): boolean
  get(id: string): T | undefined
  has(id: string): boolean
  list(): T[]
  clear(): void
}

export function createTemplateRegistry<T extends { id: string }>(): TemplateRegistry<T> {
  const items = new Map<string, T>()

  return {
    register(item) {
      items.set(item.id, item)
    },
    unregister(id) {
      return items.delete(id)
    },
    get(id) {
      return items.get(id)
    },
    has(id) {
      return items.has(id)
    },
    list() {
      return Array.from(items.values())
    },
    clear() {
      items.clear()
    },
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing or invalid "${key}"`)
  }
  return value
}
