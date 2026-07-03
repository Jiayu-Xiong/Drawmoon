import { Show, type JSX } from "solid-js"

export function SessionField(props: {
  label: string
  hint?: string
  children: JSX.Element
}) {
  return (
    <label class="session-field">
      <span class="session-field__label">{props.label}</span>
      <Show when={props.hint}>
        <small class="session-field__hint">{props.hint!}</small>
      </Show>
      <div class="session-field__control">{props.children}</div>
    </label>
  )
}

export function SessionInput(props: {
  value: string
  placeholder?: string
  onInput?: (value: string) => void
  onBlur?: (value: string) => void
  class?: string
}) {
  return (
    <input
      class={`session-control session-control--input ${props.class ?? ""}`}
      value={props.value}
      placeholder={props.placeholder}
      onInput={(event) => props.onInput?.(event.currentTarget.value)}
      onBlur={(event) => props.onBlur?.(event.currentTarget.value)}
    />
  )
}

export function SessionSelect(props: {
  value: string
  onChange: (value: string) => void
  onClick?: (event: MouseEvent) => void
  children: JSX.Element
}) {
  return (
    <select
      class="session-control session-control--select"
      value={props.value}
      onClick={props.onClick}
      onChange={(event) => props.onChange(event.currentTarget.value)}
    >
      {props.children}
    </select>
  )
}
