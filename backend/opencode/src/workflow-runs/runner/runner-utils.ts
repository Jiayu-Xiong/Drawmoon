export function resolveParallelLimit(): number {
  const env = Number(process.env.WF_PARALLEL_LIMIT)
  if (Number.isFinite(env) && env > 0) return Math.floor(env)
  return 2
}

export function isConcurrencyLimitError(message: string): boolean {
  return /(concurrency limit|all accounts busy)/i.test(message)
}

export type ParallelLimitHolder = { value: number }

export function createParallelLimitHolder(initial = resolveParallelLimit()): ParallelLimitHolder {
  return { value: Math.max(1, initial) }
}

export function reduceParallelLimit(holder: ParallelLimitHolder): void {
  holder.value = Math.max(1, Math.floor(holder.value / 2))
}

export async function runBatchWithLimit<T>(
  items: T[],
  fn: (item: T) => Promise<boolean>,
  limitOrHolder: number | ParallelLimitHolder = resolveParallelLimit(),
): Promise<boolean[]> {
  const limit = () => (typeof limitOrHolder === "number" ? limitOrHolder : limitOrHolder.value)
  const results: boolean[] = new Array(items.length)
  let index = 0
  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++
      results[i] = await fn(items[i]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit(), items.length) }, () => worker()))
  return results
}

export async function runBatchWithAdaptiveRetry<T>(
  items: T[],
  fn: (item: T) => Promise<boolean>,
  isRetryableFailure: (item: T) => boolean,
  limitHolder: ParallelLimitHolder,
  onBeforeRetry?: (item: T) => Promise<void>,
): Promise<boolean[]> {
  const results = await runBatchWithLimit(items, fn, limitHolder)
  if (results.every(Boolean)) return results

  const retryable = items.filter((item, i) => !results[i] && isRetryableFailure(item))
  if (!retryable.length) return results

  if (limitHolder.value > 1) {
    reduceParallelLimit(limitHolder)
    if (limitHolder.value === 1) {
      console.warn(`[runner] concurrency pressure — retrying ${retryable.length} node(s) serially`)
    } else {
      console.warn(`[runner] concurrency pressure — retrying ${retryable.length} node(s) at limit ${limitHolder.value}`)
    }
  }

  for (const item of retryable) {
    await onBeforeRetry?.(item)
  }
  const retryResults = await runBatchWithLimit(retryable, fn, limitHolder)
  const retryMap = new Map(retryable.map((item, i) => [item, retryResults[i]!]))
  return items.map((item, i) => results[i] || retryMap.get(item) || false)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function stripForHistory(text: string) {
  return text
    .split("\n")
    .filter((line) => !/^(Searching for files:|鉁?Successfully found|鉁?No files found| - Completed in)/i.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function normalizeLabels(labels: string[] | undefined): string[] {
  if (!labels) return []
  return [...new Set(labels.map((label) => label.trim()).filter(Boolean))]
}
