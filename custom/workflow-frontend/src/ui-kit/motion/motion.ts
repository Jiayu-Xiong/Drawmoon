export type MotionDirection = 1 | -1

export interface SwitchPaneAttrs {
  class: string
  style?: { "--wf-dir": string }
}

/** Build attrs for workflow entity switch animation (`.workflow-switch-pane`). */
export function switchPaneAttrs(tick: number, direction: MotionDirection): SwitchPaneAttrs {
  if (tick === 0) {
    return { class: "workflow-switch-pane" }
  }
  return {
    class: "workflow-switch-pane wf-animate-in",
    style: { "--wf-dir": String(direction) },
  }
}

/** CSS class names for motion presets. */
export const MotionClass = {
  fadeIn: "wf-motion-fade-in",
  pulse: "wf-motion-pulse",
  spin: "wf-motion-spin",
} as const
