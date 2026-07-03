import { createMemo, Show } from "solid-js"

import type { BackendProvider, SystemSnapshot } from "../../../data/console-model"
import type { LocalCliInfo } from "../../../api"
import { AgentModesView as AgentModesPage } from "../../AgentModesView"
import { LlmApiView as LlmApiPage } from "../../LlmApiView"
import { TemplatesView } from "../../TemplatesView"
import { APP_VIEWS, appIndex, type AppView } from "../navigation"
import { TemplateGenView } from "./template-gen/TemplateGenView"
import { EditorView } from "./templates/EditorView"
import { SystemView } from "./system/SystemView"
import { ToolsView } from "./tools/ToolsView"
export function AppStage(props: {
  view: AppView
  mountedViews: AppView[]
  appReady: boolean
  animating: boolean
  appSwitching: boolean
  providers: BackendProvider[]
  snapshot: SystemSnapshot
  cliInfo?: LocalCliInfo | null
  onRefreshCliInfo?: () => void
  onTrackTransitionEnd: (event: TransitionEvent) => void
}) {
  const offset = createMemo(() => appIndex(props.view))
  const panelShare = createMemo(() => 100 / APP_VIEWS.length)
  const isMounted = (view: AppView) => props.mountedViews.includes(view)
  const panelStyle = () => ({ flex: `0 0 ${panelShare()}%`, width: `${panelShare()}%` })

  return (
    <div class="app-stage-viewport" classList={{ "is-switching": props.appSwitching }}>
      <div
        class="app-stage-track"
        classList={{ "is-ready": props.appReady, "is-animating": props.animating }}
        style={{
          width: `${APP_VIEWS.length * 100}%`,
          transform: `translate3d(-${offset() * panelShare()}%, 0, 0)`,
        }}
        onTransitionEnd={props.onTrackTransitionEnd}
      >
        <div class="app-stage-panel" classList={{ "is-active": props.view === "editor" }} style={panelStyle()}>
          <Show when={isMounted("editor")}>
            <TemplatesView editor={EditorView} cliInfo={props.cliInfo} onRefreshCliInfo={props.onRefreshCliInfo} />
          </Show>
        </div>
        <div class="app-stage-panel" classList={{ "is-active": props.view === "templateGen" }} style={panelStyle()}>
          <Show when={isMounted("templateGen")}>
            <TemplateGenView />
          </Show>
        </div>
        <div class="app-stage-panel" classList={{ "is-active": props.view === "system" }} style={panelStyle()}>
          <Show when={isMounted("system")}>
            <SystemView providers={props.providers} snapshot={props.snapshot} onRefreshCliInfo={props.onRefreshCliInfo} />
          </Show>
        </div>
        <div class="app-stage-panel" classList={{ "is-active": props.view === "tools" }} style={panelStyle()}>
          <Show when={isMounted("tools")}>
            <ToolsView />
          </Show>
        </div>
        <div class="app-stage-panel" classList={{ "is-active": props.view === "agentModes" }} style={panelStyle()}>
          <Show when={isMounted("agentModes")}>
            <AgentModesPage />
          </Show>
        </div>
        <div class="app-stage-panel" classList={{ "is-active": props.view === "llmApi" }} style={panelStyle()}>
          <Show when={isMounted("llmApi")}>
            <LlmApiPage />
          </Show>
        </div>
      </div>
    </div>
  )
}

