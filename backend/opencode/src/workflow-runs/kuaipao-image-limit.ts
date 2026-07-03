/** Hard cap: one Kuaipao / OpenAI-compatible image generation in flight globally. */
let inFlight = 0
const waiters: Array<() => void> = []

function release() {
  inFlight = Math.max(0, inFlight - 1)
  const next = waiters.shift()
  if (next) next()
}

export async function withKuaipaoImageSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight >= 1) {
    await new Promise<void>((resolve) => waiters.push(resolve))
  }
  inFlight += 1
  try {
    return await fn()
  } finally {
    release()
  }
}
