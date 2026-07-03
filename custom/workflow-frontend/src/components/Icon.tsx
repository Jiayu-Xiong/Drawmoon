import type { JSX } from "solid-js"

export type IconName =
  | "home"
  | "workflow"
  | "status"
  | "system"
  | "template"
  | "agent"
  | "api"
  | "import"
  | "plus"
  | "save"
  | "play"
  | "pause"
  | "refresh"
  | "export"
  | "settings"
  | "trash"
  | "zoomIn"
  | "zoomOut"
  | "branch"
  | "merge"
  | "loop"
  | "tools"
  | "chevronLeft"
  | "chevronRight"

const PATHS: Record<IconName, string> = {
  home: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
  workflow: "M4 6a3 3 0 1 1 5.83 1H14a4 4 0 0 1 4 4v2.17a3 3 0 1 1-2 0V11a2 2 0 0 0-2-2H9.83a3 3 0 0 1-3.66 0H6v6.17a3 3 0 1 1-2 0V8.83A3 3 0 0 1 4 6zm2 1a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm0 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm12-2a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",
  status: "M12 2a10 10 0 1 0 .01 0zM7 13h4V7h2v8H7v-2zm10-1a1.5 1.5 0 1 1-3.01 0A1.5 1.5 0 0 1 17 12z",
  system: "M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-5v2h3v2H8v-2h3v-2H6a2 2 0 0 1-2-2V5zm2 0v9h12V5H6z",
  template: "M5 3h6v8H5V3zm8 0h6v5h-6V3zM5 13h6v8H5v-8zm8-3h6v11h-6V10z",
  agent: "M7 8V6a5 5 0 0 1 10 0v2h1a3 3 0 0 1 3 3v5a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-5a3 3 0 0 1 3-3h1zm2 0h6V6a3 3 0 0 0-6 0v2zm0 6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm6 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  api: "M8 7H5a3 3 0 0 0 0 6h3v2H5A5 5 0 0 1 5 5h3v2zm8 0v-2h3a5 5 0 0 1 0 10h-3v-2h3a3 3 0 0 0 0-6h-3zm-9 4h10v2H7v-2z",
  import: "M11 3h2v9l3-3 1.4 1.4L12 15.8l-5.4-5.4L8 9l3 3V3zM5 18h14v2H5v-2z",
  plus: "M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z",
  save: "M5 3h12l2 2v16H5V3zm2 2v5h10V6.2L15.8 5H7zm2 10v4h6v-4H9z",
  play: "M8 5v14l11-7L8 5z",
  pause: "M7 5h4v14H7V5zm6 0h4v14h-4V5z",
  refresh: "M17.7 6.3A8 8 0 1 0 20 12h-2a6 6 0 1 1-1.76-4.24L13 11h8V3l-3.3 3.3z",
  export: "M13 5v8h-2V5L8 8 6.6 6.6 12 1.2l5.4 5.4L16 8l-3-3zM5 14h2v5h10v-5h2v7H5v-7z",
  settings: "M19.4 13.5a7.8 7.8 0 0 0 .05-1.5l2-1.5-2-3.5-2.4 1a7 7 0 0 0-1.3-.75L15.4 4h-4l-.35 2.75c-.46.2-.9.45-1.3.75L7.35 6.5l-2 3.5 2 1.5a7.8 7.8 0 0 0 0 1.5l-2 1.5 2 3.5 2.4-1c.4.3.84.55 1.3.75L11.4 20h4l.35-2.75c.46-.2.9-.45 1.3-.75l2.4 1 2-3.5-2.05-1.5zM13.4 14.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z",
  trash: "M8 6V4h8v2h5v2H3V6h5zm-2 4h12l-1 11H7L6 10z",
  zoomIn: "M10 4a6 6 0 0 1 4.7 9.7l4.3 4.3-1.4 1.4-4.3-4.3A6 6 0 1 1 10 4zm-1 3v2H7v2h2v2h2v-2h2V9h-2V7H9z",
  zoomOut: "M10 4a6 6 0 0 1 4.7 9.7l4.3 4.3-1.4 1.4-4.3-4.3A6 6 0 1 1 10 4zm-3 5v2h6V9H7z",
  branch: "M7 4a3 3 0 0 1 2 5.24V10h4a4 4 0 0 1 4 4v.76A3 3 0 1 1 15 17v-3a2 2 0 0 0-2-2H9v2.76A3 3 0 1 1 7 12V9.24A3 3 0 0 1 7 4z",
  merge: "M17 4a3 3 0 0 0-2 5.24V10h-4a4 4 0 0 0-4 4v.76A3 3 0 1 0 9 17v-3a2 2 0 0 1 2-2h4v2.76A3 3 0 1 0 17 12V9.24A3 3 0 0 0 17 4z",
  loop: "M7 7h8a4 4 0 0 1 0 8H9.8l2.6-2.6L11 11l-5 5 5 5 1.4-1.4L9.8 17H15a6 6 0 0 0 0-12H7v2z",
  tools: "M9.4 3.6 7.8 2 5.6 4.2l1.6 1.6-1.4 1.4L4.2 5.6 2 7.8l1.6 1.6-1.4 1.4L2 12.4l1.6 1.6 1.4-1.4 1.6 1.6L7.8 16l1.4-1.4 1.6 1.6 2.2-2.2-1.6-1.6 1.4-1.4 1.6 1.6L16 11.6l-1.6-1.6 1.4-1.4-1.6-1.6L16 5.6 13.8 3.4l-1.6 1.6-1.4-1.4-1.4 1.4zm.6 4.4a2 2 0 1 1 0 4 2 2 0 0 1 0-4z",
  chevronLeft: "M14.7 5.3a1 1 0 0 1 0 1.4L10.41 11l4.3 4.3a1 1 0 0 1-1.42 1.4l-5-5a1 1 0 0 1 0-1.4l5-5a1 1 0 0 1 1.41 0z",
  chevronRight: "M9.3 5.3a1 1 0 0 0 0 1.4L13.59 11l-4.3 4.3a1 1 0 0 0 1.42 1.4l5-5a1 1 0 0 0 0-1.4l-5-5a1 1 0 0 0-1.41 0z",
}

export function Icon(props: { name: IconName; size?: number; class?: string }): JSX.Element {
  const size = props.size ?? 18
  return (
    <svg class={props.class} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="currentColor">
      <path d={PATHS[props.name]} />
    </svg>
  )
}
