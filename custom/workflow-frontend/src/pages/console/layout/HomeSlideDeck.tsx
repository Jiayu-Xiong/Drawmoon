import { createMemo, Show } from "solid-js"

import { Icon } from "../../../components/Icon"
import type { LocalCliInfo } from "../../../api"
import type { BackendProvider, SystemSnapshot, WorkflowEntity } from "../../../data/console-model"
import { slideIndex, type SlideView, type View } from "../navigation"
import { DetailView } from "../slides/workflow-runs/DetailView"
import { HomeView } from "../slides/home/HomeView"
import { NodeDetailView } from "../slides/node-workflow/NodeDetailView"
export function HomeSideNav(props: { view: SlideView; animating: boolean; onWorkflowDetail: () => void; onNodeDetail: () => void; onHome: () => void }) {
  return (
    <div class="home-side-nav" classList={{ "is-animating": props.animating }} data-view={props.view}>
      <button
        type="button"
        class="home-side-nav-btn nav-left"
        classList={{ "is-arrow": props.view === "nodeDetail", "is-hidden": props.view === "detail" }}
        aria-label={props.view === "nodeDetail" ? "Back to Home" : "Workflow Detail"}
        onClick={() => props.view === "nodeDetail" ? props.onHome() : props.onWorkflowDetail()}
      >
        <span class="nav-btn-face nav-btn-face--pill" aria-hidden={props.view === "nodeDetail"}>
          <Icon name="branch" size={24} />
          <span>Workflow Detail</span>
        </span>
        <span class="nav-btn-face nav-btn-face--arrow" aria-hidden={props.view !== "nodeDetail"}>
          <Icon name="chevronLeft" size={28} />
        </span>
      </button>
      <button
        type="button"
        class="home-side-nav-btn nav-right"
        classList={{ "is-arrow": props.view === "detail", "is-hidden": props.view === "nodeDetail" }}
        aria-label={props.view === "detail" ? "Back to Home" : "Node Detail"}
        onClick={() => props.view === "detail" ? props.onHome() : props.onNodeDetail()}
      >
        <span class="nav-btn-face nav-btn-face--pill" aria-hidden={props.view === "detail"}>
          <span>Node Detail</span>
          <Icon name="merge" size={24} />
        </span>
        <span class="nav-btn-face nav-btn-face--arrow" aria-hidden={props.view !== "detail"}>
          <Icon name="chevronRight" size={28} />
        </span>
      </button>
    </div>
  )
}

export function HomeSlideDeck(props: {
  view: SlideView
  activeSlideView: SlideView | null
  mountedViews: SlideView[]
  slideReady: boolean
  animating: boolean
  providers: BackendProvider[]
  entity: WorkflowEntity
  snapshot: SystemSnapshot
  cliInfo?: LocalCliInfo | null
  cliRefreshing?: boolean
  cliRefreshingProviders?: string[]
  onRefreshCliInfo?: () => void
  onView: (view: View) => void
  onEntity: (entity: WorkflowEntity) => void
  onNodeDetail: () => void
  onHome: () => void
  onTrackTransitionEnd: (event: TransitionEvent) => void
}) {
  const PANEL_PCT = 100 / 3
  const GUTTER_PCT = 100 / 18
  const offset = createMemo(() => slideIndex(props.view))
  const isMounted = (view: SlideView) => props.mountedViews.includes(view)

  return (
    <div class="home-slide-viewport">
      <div
        class="home-slide-track"
        classList={{ "is-ready": props.slideReady, "is-animating": props.animating }}
        style={{ transform: `translate3d(calc(${GUTTER_PCT}% - ${offset()} * ${PANEL_PCT}%), 0, 0)` }}
        onTransitionEnd={props.onTrackTransitionEnd}
      >
        <div class="home-slide-panel home-slide-panel--detail" classList={{ "is-slide-active": props.view === "detail" || props.activeSlideView === "detail" }}>
          <Show when={isMounted("detail")}>
            <DetailView
              entity={props.entity}
              slideActive={props.view === "detail" || props.activeSlideView === "detail"}
              onView={props.onView}
              onHome={props.onHome}
            />
          </Show>
        </div>
        <div class="home-slide-panel home-slide-panel--home" classList={{ "is-slide-active": props.activeSlideView === "home" }}>
          <Show when={isMounted("home")}>
            <HomeView providers={props.providers} onView={props.onView} onEntity={props.onEntity} />
          </Show>
        </div>
        <div class="home-slide-panel home-slide-panel--nodes" classList={{ "is-slide-active": props.activeSlideView === "nodeDetail" }}>
          <Show when={isMounted("nodeDetail")}>
            <NodeDetailView
              entity={props.entity}
              providers={props.providers}
              snapshot={props.snapshot}
              cliInfo={props.cliInfo}
              cliRefreshing={props.cliRefreshing}
              cliRefreshingProviders={props.cliRefreshingProviders}
              onRefreshCliInfo={props.onRefreshCliInfo}
              onView={props.onView}
            />
          </Show>
        </div>
      </div>
      <HomeSideNav
        view={props.view}
        animating={props.animating}
        onWorkflowDetail={() => props.onEntity(props.entity)}
        onNodeDetail={props.onNodeDetail}
        onHome={props.onHome}
      />
    </div>
  )
}
