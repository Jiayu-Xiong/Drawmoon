import { batch, createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"

import type { RuntimeSnapshot } from "../../api"
import { getCliInfo, startCliInfoRefresh } from "../../api"
import type { WorkflowEntity } from "../../data/console-model"
import { fetchWorkflowRunsInDisplayThread, setCachedRuns, startWorkflowRunsPoll, syncRunMonitors } from "../../runtime-bridge"
import { scheduleRevalidateForView } from "../../data/console-revalidate"
import { bootstrapTemplateRegistry } from "../../data/template-store"
import { ensureRuntimeCache, getCachedRuntimeSnapshot, invalidateRuntimeCache, patchRuntimeCache } from "../../data/runtime-cache"
import { providersFromRuntime, systemFromRuntime } from "./runtime"
import { AppLauncher } from "./layout/AppLauncher"
import { AppStage } from "./apps/AppStage"
import { EntitiesView } from "./entities/EntitiesView"
import { HomeSlideDeck } from "./layout/HomeSlideDeck"
import { isAppView, isSlideView, motionDuration, motionForHistory, resolveMotion, uniqueAppViews, uniqueSlideViews, viewFromLocation, writeViewHistory, type AppView, type MotionKind, type SlideView, type View } from "./navigation"
import { bindGutterWheelScroll } from "../../utils/gutter-wheel-scroll"
import { resetWorkflowDetailPane, syncWorkflowDetailPaneFromLocation } from "./slides/workflow-runs/detail-nav"
import { setOpencodeTelemetryCache } from "../../data/workflow-entity/token-usage"
import { getWorkflowEntityList, subscribeWorkflowEntities } from "./shared/core"

function pickHomeEntity(): WorkflowEntity {
  return getWorkflowEntityList()[0] ?? {
    id: "home-shell-placeholder",
    templateId: "paper-journal-default",
    name: "No workflow loaded",
    status: "queued",
    workingDirectory: "",
    currentColumn: 1,
    currentStageId: "",
    runtime: "backend-opencode",
    model: "",
    queuePosition: 0,
    progress: 0,
    columnStates: [],
    activeAgents: [],
    logs: [],
    filesTouched: [],
    artifacts: [],
    toolsUsed: [],
    latestOutput: "Start runtime and refresh workflow instances.",
  }
}

export default function ConsoleApp() {
  const [view, setView] = createSignal<View>(viewFromLocation())
  const [visualView, setVisualView] = createSignal<View>(viewFromLocation())
  const [selectedEntity, setSelectedEntity] = createSignal<WorkflowEntity>(pickHomeEntity())
  const [swipeStart, setSwipeStart] = createSignal<number | null>(null)
  const [motion, setMotion] = createSignal<MotionKind>("idle")
  const [slideReady, setSlideReady] = createSignal(false)
  const [appReady, setAppReady] = createSignal(false)
  const [lastAppView, setLastAppView] = createSignal<AppView>(isAppView(viewFromLocation()) ? viewFromLocation() as AppView : "system")
  const [transitionAppView, setTransitionAppView] = createSignal<AppView>(isAppView(viewFromLocation()) ? viewFromLocation() as AppView : "system")
  const [mountedSlideViews, setMountedSlideViews] = createSignal<SlideView[]>(isSlideView(viewFromLocation()) ? [viewFromLocation() as SlideView] : [])
  const [mountedAppViews, setMountedAppViews] = createSignal<AppView[]>(isAppView(viewFromLocation()) ? [viewFromLocation() as AppView] : [])
  const [viewport, setViewport] = createSignal(measureViewport())
  const [navOffset, setNavOffset] = createSignal(148)
  const [dockNavHeight, setDockNavHeight] = createSignal(148)
  const [runtime, setRuntime] = createSignal<RuntimeSnapshot | null>(null)
  const [cliRefreshing, setCliRefreshing] = createSignal(false)
  let navRef: HTMLElement | undefined
  let shellRef: HTMLElement | undefined
  let navObserver: ResizeObserver | undefined
  const providers = createMemo(() => providersFromRuntime(runtime()))
  const snapshot = createMemo(() => systemFromRuntime(runtime()))

  createEffect(() => {
    const opencodeLive = runtime()?.cliInfo?.liveSnapshots?.find((entry) => entry.providerId === "opencode")
    setOpencodeTelemetryCache(opencodeLive?.telemetry)
  })
  let motionTimer: number | undefined

  const navDocked = createMemo(() => (visualView() === "home" || motion() === "dock-lift") && motion() !== "dock-drop")
  const navReceded = createMemo(() => (visualView() === "detail" || visualView() === "nodeDetail") && !isAppView(visualView()))
  const navElevated = createMemo(() => isAppView(visualView()) && motion() !== "dock-drop" && motion() !== "dock-lift")
  const slideLayerVisible = createMemo(() => isSlideView(visualView()) || motion() === "dock-drop" || motion() === "dock-lift")
  const appLayerVisible = createMemo(() => isAppView(visualView()) || motion() === "dock-drop" || motion() === "dock-lift")
  const activeAppView = createMemo<AppView>(() => {
    const current = view()
    return isAppView(current) ? current : lastAppView()
  })
  const displayedAppView = createMemo<AppView>(() => {
    const visual = visualView()
    return isAppView(visual) ? visual : transitionAppView()
  })
  const animating = createMemo(() => motion() !== "idle")

  createEffect(() => {
    const current = view()
    if (isAppView(current)) setLastAppView(current)
  })

  function finishMotion() {
    window.clearTimeout(motionTimer)
    const current = view()
    batch(() => {
      setMotion("idle")
      setVisualView(current)
      setMountedSlideViews((prev) => (
        isSlideView(current) ? uniqueSlideViews([...prev, current]) : prev
      ))
      setMountedAppViews((prev) => (
        isAppView(current) ? uniqueAppViews([...prev, current]) : prev
      ))
    })
    requestAnimationFrame(measureNavOffset)
  }

  function scheduleMotionEnd(kind: MotionKind) {
    window.clearTimeout(motionTimer)
    const ms = motionDuration(kind)
    if (ms <= 0) {
      finishMotion()
      return
    }
    motionTimer = window.setTimeout(finishMotion, ms + 120)
  }

  function onSlideTrackTransitionEnd(event: TransitionEvent) {
    if (event.propertyName !== "transform") return
    const current = motion()
    if (current === "slide-left" || current === "slide-right") finishMotion()
  }

  function onAppTrackTransitionEnd(event: TransitionEvent) {
    if (event.propertyName !== "transform") return
    if (motion() === "app-switch") finishMotion()
  }

  function onShellAnimationEnd(event: AnimationEvent) {
    const current = motion()
    if (current !== "dock-lift" && current !== "dock-drop") return
    if (!event.target || !(event.target as HTMLElement).classList.contains("stage-layer--app")) return
    finishMotion()
  }

  function measureViewport() {
    const width = typeof window === "undefined" ? 1440 : window.innerWidth || 1440
    const height = typeof window === "undefined" ? 900 : window.innerHeight || 900
    const ratio = width / Math.max(height, 1)
    const panelWidth = Math.round(Math.min(960, Math.max(520, width * 0.5)))
    const panelHeight = Math.round(Math.min(760, Math.max(440, height * (height < 820 ? 0.54 : 0.62))))
    const scale = Math.min(1, Math.max(0.92, Math.min(width / 1200, height / 820)))
    return { width, height, ratio, panelWidth, panelHeight, scale }
  }

  function readViewport() {
    setViewport(measureViewport())
    measureNavOffset()
  }

  function measureNavOffset() {
    const nav = navRef
    if (!nav) return
    // Freeze measurements during dock animations to avoid layout thrash
    // (nav glass padding animates, which would otherwise trigger continuous
    //  ResizeObserver → navOffset → padding-top changes → re-layout loops)
    if (motion() === "dock-lift" || motion() === "dock-drop") return
    const rect = nav.getBoundingClientRect()
    if (rect.height <= 0) return
    setDockNavHeight(Math.ceil(rect.height))
    setNavOffset(Math.ceil(rect.bottom + 14))
  }

  function bindNavRef(el: HTMLElement | undefined) {
    navRef = el
    navObserver?.disconnect()
    if (!el) return
    navObserver = new ResizeObserver(() => measureNavOffset())
    navObserver.observe(el)
    measureNavOffset()
  }

  const shellStyle = createMemo(() => {
    const item = viewport()
    return `--home-scale:${item.scale};--home-panel-width:${item.panelWidth}px;--home-panel-height:${item.panelHeight}px;--console-nav-offset:${navOffset()}px;--dock-nav-height:${dockNavHeight()}px;`
  })

  onMount(() => {
    if (viewFromLocation() === "detail") syncWorkflowDetailPaneFromLocation()
    writeViewHistory(view(), "replace")
    window.addEventListener("resize", readViewport)
    requestAnimationFrame(() => {
      setSlideReady(true)
      setAppReady(true)
      measureNavOffset()
    })
    const onHashChange = () => {
      if (viewFromLocation() === "detail") syncWorkflowDetailPaneFromLocation()
    }
    const onPopState = () => {
      const next = viewFromLocation()
      if (next === "detail") syncWorkflowDetailPaneFromLocation()
      const kind = motionForHistory(view(), next)
      const current = view()
      batch(() => {
        setMountedSlideViews(uniqueSlideViews([
          isSlideView(current) ? current : undefined,
          isSlideView(next) ? next : undefined,
        ]))
      setMountedAppViews(uniqueAppViews([
        isAppView(current) ? current : undefined,
        isAppView(next) ? next : undefined,
      ]))
        if (isAppView(current)) setTransitionAppView(current)
        if (isAppView(next)) setTransitionAppView(next)
        setMotion(kind)
        setView(next)
        setVisualView(kind === "dock-drop" ? current : next)
      })
      scheduleMotionEnd(kind)
    }
    window.addEventListener("popstate", onPopState)
    window.addEventListener("hashchange", onHashChange)
    void bootstrapTemplateRegistry().then(() => {
      void ensureRuntimeCache().then((snapshot) => {
        if (snapshot) setRuntime(snapshot)
      })
      void fetchWorkflowRunsInDisplayThread()
        .then((runs) => {
          setCachedRuns(runs)
          syncRunMonitors(runs)
        })
        .catch(() => undefined)
    })
    const globalRunsPoll = startWorkflowRunsPoll({
      intervalMs: 12000,
      stopWhenIdle: true,
      onRuns: (runs) => {
        setCachedRuns(runs)
        syncRunMonitors(runs)
      },
    })
    const runtimePoll = window.setInterval(() => {
      const refreshing = cliRefreshing()
        || (runtime()?.cliRefreshing?.length ?? 0) > 0
        || runtime()?.cliRefreshActive === true
      const activeRuns = getWorkflowEntityList().some((item) => item.status === "running" || item.status === "looping")
      if (refreshing || activeRuns) void refreshRuntimeLite()
    }, 10000)
    const unsubEntities = subscribeWorkflowEntities(() => {
      const list = getWorkflowEntityList()
      if (!list.length) return
      const current = selectedEntity()
      if (!list.some((item) => item.id === current.id) || current.id === "home-shell-placeholder") {
        setSelectedEntity(list[0]!)
      }
    })
    const unbindWheel = shellRef ? bindGutterWheelScroll(shellRef) : undefined
    onCleanup(() => {
      unbindWheel?.()
      window.clearInterval(runtimePoll)
      globalRunsPoll()
      navObserver?.disconnect()
      window.removeEventListener("resize", readViewport)
      window.removeEventListener("popstate", onPopState)
      window.removeEventListener("hashchange", onHashChange)
      unsubEntities()
    })
  })
  onCleanup(() => window.clearTimeout(motionTimer))

  function go(next: View, kind: MotionKind = "idle", historyMode: "push" | "replace" | "none" = "push") {
    const current = view()
    let currentMotion = motion()
    if (next === current && kind === "idle" && currentMotion === "idle") return
    const chainingAppSwitch = currentMotion === "app-switch" && isAppView(current) && isAppView(next)
    if (currentMotion !== "idle" && !chainingAppSwitch) {
      finishMotion()
      currentMotion = motion()
    }
    const nextMotion = resolveMotion(current, next, kind)
    if (chainingAppSwitch) window.clearTimeout(motionTimer)
    const nextSlideMounts = uniqueSlideViews([
      isSlideView(current) ? current : undefined,
      isSlideView(next) ? next : undefined,
    ])
    const nextAppMounts = uniqueAppViews([
      isAppView(current) ? current : undefined,
      isAppView(next) ? next : undefined,
    ])
    batch(() => {
      if (nextSlideMounts.length) {
        setMountedSlideViews((prev) => uniqueSlideViews([...prev, ...nextSlideMounts]))
      }
      if (nextAppMounts.length) {
        setMountedAppViews((prev) => uniqueAppViews([...prev, ...nextAppMounts]))
      }
      if (isAppView(current)) setTransitionAppView(current)
      if (isAppView(next)) setTransitionAppView(next)
      if (nextMotion !== "idle") setMotion(nextMotion)
      setView(next)
      setVisualView(nextMotion === "dock-drop" ? current : next)
    })
    if (current === "detail" && next !== "detail") resetWorkflowDetailPane()
    if (next === "detail" && current !== "detail") resetWorkflowDetailPane()
    if (historyMode !== "none") writeViewHistory(next, historyMode, next === "detail" && current !== "detail" ? { preserveRunDetail: false } : undefined)
    scheduleMotionEnd(nextMotion)
    scheduleRevalidateForView(next)
  }

  function goHomeFromSlide() {
    if (view() === "detail") go("home", "slide-right")
    else if (view() === "nodeDetail") go("home", "slide-left")
    else go("home")
  }

  function navigateApp(next: View) {
    go(next)
  }

  async function pollCliInfoUntilSettled() {
    let idlePolls = 0
    for (;;) {
      const { info, refreshing, refreshActive } = await getCliInfo()
      setRuntime((current) => current ? {
        ...current,
        cliInfo: info,
        cliRefreshing: refreshing,
      } : current)
      if (!refreshActive && !refreshing.length) {
        idlePolls += 1
        if (idlePolls >= 2) break
      } else {
        idlePolls = 0
      }
      await new Promise((resolve) => window.setTimeout(resolve, 450))
    }
  }

  async function refreshRuntimeLite() {
    try {
      const snapshot = await getCliInfo()
      setRuntime((current) => current ? {
        ...current,
        cliInfo: snapshot.info,
        cliRefreshing: snapshot.refreshing,
        cliRefreshActive: snapshot.refreshActive,
      } : current)
    } catch {
      // keep last snapshot
    }
  }

  async function refreshRuntime(options?: { refreshCli?: boolean }) {
    try {
      if (options?.refreshCli) {
        setCliRefreshing(true)
        await startCliInfoRefresh()
        await pollCliInfoUntilSettled()
        return
      }
      const snapshot = await ensureRuntimeCache({ force: true })
      setRuntime(snapshot ?? getCachedRuntimeSnapshot())
      await bootstrapTemplateRegistry({ background: true })
      const cli = await getCliInfo().catch(() => null)
      if (cli) {
        patchRuntimeCache({
          cliInfo: cli.info,
          cliRefreshing: cli.refreshing,
          cliRefreshActive: cli.refreshActive,
        })
        setRuntime(getCachedRuntimeSnapshot())
      }
      if (cli?.refreshActive) {
        setCliRefreshing(true)
        try {
          await pollCliInfoUntilSettled()
        } finally {
          setCliRefreshing(false)
        }
      }
    } catch {
      setRuntime(getCachedRuntimeSnapshot())
    } finally {
      if (options?.refreshCli) setCliRefreshing(false)
    }
  }

  function openEntity(entity: WorkflowEntity) {
    setSelectedEntity(entity)
    go("detail", "slide-left")
  }

  function openNodeDetail() {
    go("nodeDetail", "slide-right")
  }

  function onPointerUp(x: number) {
    const start = swipeStart()
    setSwipeStart(null)
    if (start === null || !isSlideView(view())) return
    const dx = x - start
    if (view() === "home") {
      if (dx < -80) openEntity(selectedEntity())
      if (dx > 80) openNodeDetail()
      return
    }
    if (view() === "detail" && dx > 80) goHomeFromSlide()
    if (view() === "nodeDetail" && dx < -80) goHomeFromSlide()
  }

  return (
    <main
      ref={shellRef}
      class="console-shell"
      classList={{
        "is-home": visualView() === "home",
        "is-slide-deck": isSlideView(visualView()) && motion() !== "dock-drop",
        "is-app-shell": isAppView(visualView()) || motion() === "dock-lift" || motion() === "dock-drop",
        "is-nav-docked": navDocked(),
        "is-nav-receded": navReceded(),
        "is-nav-elevated": navElevated(),
        "is-side-page": visualView() === "detail" || visualView() === "nodeDetail",
        "is-ultrawide": viewport().ratio > 2.05,
        "is-compact-height": viewport().height < 820,
        "is-animating": animating(),
        "motion-slide-left": motion() === "slide-left",
        "motion-slide-right": motion() === "slide-right",
        "motion-dock-lift": motion() === "dock-lift",
        "motion-dock-drop": motion() === "dock-drop",
        "motion-app-switch": motion() === "app-switch",
      }}
      style={shellStyle()}
      onPointerDown={(event) => {
        const target = event.target as HTMLElement
        if (view() !== "home" || target.closest("button,a,input,select,textarea,.template-canvas,.workflow-map,.home-side-nav,.home-side-nav-btn,.console-nav,.workflow-instance-card,.workflow-instance-open,.workflow-instance-browser,.workflow-run-panes,.node-manager-card,.masonry-columns,[data-workflow-instance-id]")) {
          setSwipeStart(null)
          return
        }
        setSwipeStart(event.clientX)
      }}
      onPointerUp={(event) => {
        if (view() !== "home") return
        const target = event.target as HTMLElement
        if (target.closest("[data-workflow-instance-id], .workflow-instance-card, .workflow-instance-open, .workflow-run-panes, .home-side-nav, .home-side-nav-btn")) return
        onPointerUp(event.clientX)
      }}
      onPointerCancel={() => setSwipeStart(null)}
    >
      <div class="floral-wash" />
      <nav
        ref={bindNavRef}
        class="console-nav wf-glass"
      >
        <div class="console-nav-glass">
          <div class="home-glass-filter" />
          <div class="home-glass-overlay" />
          <div class="home-glass-specular" />
          <AppLauncher
            view={view()}
            includeHome
            onNavigate={navigateApp}
          />
        </div>
      </nav>
      <section class={`console-stage view-${visualView()}`}>
        <div class="stage-layers">
          <div class="stage-layer stage-layer--slide" classList={{ "is-visible": slideLayerVisible() }}>
            <HomeSlideDeck
              view={(isSlideView(visualView()) ? visualView() : "home") as SlideView}
              activeSlideView={isSlideView(visualView()) ? (visualView() as SlideView) : null}
              mountedViews={mountedSlideViews()}
              slideReady={slideReady()}
              animating={animating()}
              providers={providers()}
              entity={selectedEntity()}
              snapshot={snapshot()}
              cliInfo={runtime()?.cliInfo ?? null}
              cliRefreshing={cliRefreshing() || (runtime()?.cliRefreshing?.length ?? 0) > 0 || runtime()?.cliRefreshActive === true}
              cliRefreshingProviders={runtime()?.cliRefreshing ?? []}
              onRefreshCliInfo={() => void refreshRuntime({ refreshCli: true })}
              onView={(next) => go(next, next === "home" ? (view() === "detail" ? "slide-right" : view() === "nodeDetail" ? "slide-left" : "idle") : resolveMotion(view(), next, "idle"))}
              onEntity={openEntity}
              onNodeDetail={openNodeDetail}
              onHome={goHomeFromSlide}
              onTrackTransitionEnd={onSlideTrackTransitionEnd}
            />
          </div>
          <div
            class="stage-layer stage-layer--app"
            classList={{ "is-visible": appLayerVisible() }}
            onAnimationEnd={onShellAnimationEnd}
          >
            <AppStage
              view={displayedAppView()}
              mountedViews={mountedAppViews()}
              appReady={appReady()}
              animating={animating()}
              appSwitching={motion() === "app-switch"}
              providers={providers()}
              snapshot={snapshot()}
              cliInfo={runtime()?.cliInfo ?? null}
              onRefreshCliInfo={() => void refreshRuntime({ refreshCli: true })}
              onTrackTransitionEnd={onAppTrackTransitionEnd}
            />
          </div>
          <Show when={view() === "entities"}>
            <div class="stage-layer stage-layer--entities is-visible">
              <EntitiesView onEntity={openEntity} />
            </div>
          </Show>
        </div>
      </section>
    </main>
  )
}
