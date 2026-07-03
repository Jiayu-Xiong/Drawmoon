import type { Component } from "solid-js"

import type { LocalCliInfo } from "../../api"

export function TemplatesView(props: {
  editor: Component<{ cliInfo?: LocalCliInfo | null; onRefreshCliInfo?: () => void }>
  cliInfo?: LocalCliInfo | null
  onRefreshCliInfo?: () => void
}) {
  const Editor = props.editor
  return <Editor cliInfo={props.cliInfo} onRefreshCliInfo={props.onRefreshCliInfo} />
}
