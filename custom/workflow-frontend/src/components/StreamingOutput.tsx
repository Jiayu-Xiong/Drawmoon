import { Show } from "solid-js"

export function StreamingOutput(props: {
  text: string
  live?: boolean
  class?: string
  as?: "pre" | "div"
}) {
  const Tag = props.as ?? "pre"
  return (
    <Tag class={props.class ?? "wf-streaming-output"}>
      {props.text}
      <Show when={props.live}>
        <span class="wf-stream-cursor" aria-hidden="true" />
      </Show>
    </Tag>
  )
}
