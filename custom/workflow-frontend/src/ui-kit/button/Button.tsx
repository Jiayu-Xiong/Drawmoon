import { Show } from "solid-js"

import { Icon, type IconName } from "../../components/Icon"

export type ButtonVariant = "primary" | "soft" | "danger"

export interface ButtonProps {
  icon?: IconName
  children: any
  onClick?: () => void
  variant?: ButtonVariant
  title?: string
  type?: "button" | "submit" | "reset"
  class?: string
  active?: boolean
}

/** Unified workflow button — maps to `.wf-button` styles. */
export function Button(props: ButtonProps) {
  const variant = () => props.variant ?? "soft"
  return (
    <button
      type={props.type ?? "button"}
      class={`wf-button wf-button--${variant()}${props.active ? " is-active" : ""}${props.class ? ` ${props.class}` : ""}`}
      onClick={props.onClick}
      title={props.title}
    >
      <Show when={props.icon}>
        <Icon name={props.icon!} size={16} />
      </Show>
      <span>{props.children}</span>
    </button>
  )
}

/** @deprecated Use `Button` — kept for existing imports. */
export const AppButton = Button
