/** Glass panel shell — maps to `.wf-glass` styles. */
export function Panel(props: { class?: string; children: any }) {
  return <section class={`wf-glass${props.class ? ` ${props.class}` : ""}`}>{props.children}</section>
}

/** @deprecated Use `Panel` — kept for existing imports. */
export const Glass = Panel
