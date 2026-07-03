import { createEffect, createMemo, createSignal, For, onCleanup, onMount, type JSX } from "solid-js"

export function MasonryColumns(props: {
  columns: number
  gap?: number
  class?: string
  items: JSX.Element[]
  /** Stable keys aligned with `items`; prevents DOM reuse glitches when masonry reflows. */
  itemKeys?: string[]
}) {
  const gap = () => props.gap ?? 16
  const items = createMemo(() => props.items)
  const itemKeys = createMemo(() => {
    const list = items()
    const keys = props.itemKeys
    if (keys && keys.length === list.length) return keys
    return list.map((_, index) => String(index))
  })
  const keyToIndex = createMemo(() => new Map(itemKeys().map((key, index) => [key, index])))
  const [heights, setHeights] = createSignal<Record<string, number>>({})
  const itemEls = new Map<string, HTMLElement>()
  let measureRaf = 0
  let observer: ResizeObserver | undefined

  function measure() {
    cancelAnimationFrame(measureRaf)
    measureRaf = requestAnimationFrame(() => {
      const next: Record<string, number> = {}
      for (const key of itemKeys()) {
        next[key] = itemEls.get(key)?.getBoundingClientRect().height ?? 0
      }
      setHeights(next)
    })
  }

  function observeItems() {
    if (!observer) return
    itemEls.forEach((el) => observer!.observe(el))
  }

  createEffect(() => {
    items().length
    itemKeys().length
    props.columns
    measure()
    observeItems()
  })

  onMount(() => {
    observer = new ResizeObserver(() => measure())
    observeItems()
    onCleanup(() => {
      cancelAnimationFrame(measureRaf)
      observer?.disconnect()
      observer = undefined
    })
  })

  const buckets = createMemo(() => {
    const count = Math.max(1, props.columns)
    const cols: string[][] = Array.from({ length: count }, () => [])
    const measured = heights()
    const keys = itemKeys()
    const ready = keys.length > 0 && keys.some((key) => (measured[key] ?? 0) > 0)
    const colHeights = Array(count).fill(0)

    keys.forEach((key, index) => {
      let target = index % count
      if (ready) {
        target = 0
        for (let column = 1; column < count; column += 1) {
          if (colHeights[column]! < colHeights[target]!) target = column
        }
      }
      cols[target]!.push(key)
      colHeights[target]! += (measured[key] ?? 0) + gap()
    })

    return cols
  })

  return (
    <div
      class={`masonry-columns${props.class ? ` ${props.class}` : ""}`}
      style={{ "--masonry-gap": `${gap()}px`, "--masonry-cols": String(Math.max(1, props.columns)) }}
    >
      <For each={buckets()}>
        {(bucket) => (
          <div class="masonry-columns__col">
            <For each={bucket}>
              {(key) => {
                const index = () => keyToIndex().get(key) ?? 0
                return (
                  <div
                    class="masonry-columns__item"
                    data-masonry-key={key}
                    ref={(el) => {
                      itemEls.set(key, el)
                      if (observer) observer.observe(el)
                    }}
                  >
                    {items()[index()]}
                  </div>
                )
              }}
            </For>
          </div>
        )}
      </For>
    </div>
  )
}

export function masonryColumnCount(width: number, minColumnWidth = 240, maxColumns = 6) {
  if (width <= 0) return 2
  return Math.max(2, Math.min(maxColumns, Math.floor(width / minColumnWidth)))
}

export function dashboardColumnCount(width: number, minColumnWidth = 280, maxColumns = 5) {
  if (width <= 0) return 2
  return Math.max(1, Math.min(maxColumns, Math.floor(width / minColumnWidth)))
}
