import { Show, type ParentProps } from "solid-js"

/** Clickable list/card item shell — pairs with `.entity-card` / `.wf-item` styles. */
export function ItemCard(props: ParentProps<{ class?: string; onClick?: () => void; hitClass?: string }>) {
  return (
    <section class={`wf-item entity-card${props.class ? ` ${props.class}` : ""}`}>
      <Show when={props.onClick}>
        <button type="button" class={props.hitClass ?? "entity-card-hit wf-item-hit"} onClick={props.onClick} />
      </Show>
      {props.children}
    </section>
  )
}

/** Compact summary row item. */
export function ItemSummary(props: ParentProps<{ class?: string; onClick?: () => void }>) {
  return (
    <button type="button" class={`entity-summary wf-item${props.class ? ` ${props.class}` : ""}`} onClick={props.onClick}>
      {props.children}
    </button>
  )
}
