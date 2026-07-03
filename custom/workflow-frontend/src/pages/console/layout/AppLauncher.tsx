import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js"

import { launcherSlotFromView, type LauncherNavigate, type View } from "../navigation"
import { useI18n } from "../../../i18n"
import { Icon, type IconName } from "../../../components/Icon"
export function HomeDockButton(props: { icon: IconName; label: string; tone: string; onClick: () => void; active?: boolean; dataSlot?: number }) {
  return (
    <button class={`home-dock-button tone-${props.tone}`} classList={{ active: props.active }} data-slot={props.dataSlot} onClick={props.onClick}>
      <span><Icon name={props.icon} size={36} /></span>
      <b>{props.label}</b>
    </button>
  )
}

export function AppLauncher(props: { view: View; onNavigate: LauncherNavigate; includeHome?: boolean }) {
  const { t } = useI18n()
  const focusIndex = () => launcherSlotFromView(props.view)
  let rootRef: HTMLDivElement | undefined
  const [focusBox, setFocusBox] = createSignal({ x: 0, y: 0, w: 88, h: 88 })

  let focusRaf = 0

  function layoutFocus() {
    cancelAnimationFrame(focusRaf)
    focusRaf = requestAnimationFrame(() => {
      const root = rootRef
      if (!root) return
      const slot = root.querySelector(`[data-slot="${focusIndex()}"]`)
      const icon = slot?.querySelector("span")
      if (!slot || !icon) return
      const rootRect = root.getBoundingClientRect()
      const iconRect = icon.getBoundingClientRect()
      setFocusBox({
        x: iconRect.left - rootRect.left,
        y: iconRect.top - rootRect.top,
        w: iconRect.width,
        h: iconRect.height,
      })
    })
  }

  createEffect(() => {
    focusIndex()
    props.view
    layoutFocus()
  })

  onMount(() => {
    const ro = new ResizeObserver(() => layoutFocus())
    if (rootRef) ro.observe(rootRef)
    window.addEventListener("resize", layoutFocus)
    layoutFocus()
    onCleanup(() => {
      cancelAnimationFrame(focusRaf)
      ro.disconnect()
      window.removeEventListener("resize", layoutFocus)
    })
  })

  return (
    <div ref={rootRef} class="app-launcher">
      <span
        class="app-launcher-focus"
        aria-hidden="true"
        style={{
          width: `${focusBox().w}px`,
          height: `${focusBox().h}px`,
          transform: `translate3d(${focusBox().x}px, ${focusBox().y}px, 0)`,
        }}
      />
      <Show when={props.includeHome}>
        <HomeDockButton icon="home" label={t("nav.home")} tone="gold" dataSlot={0} active={focusIndex() === 0} onClick={() => props.onNavigate("home")} />
      </Show>
      <HomeDockButton icon="template" label={t("nav.templates")} tone="pink" dataSlot={1} active={focusIndex() === 1} onClick={() => props.onNavigate("editor")} />
      <HomeDockButton icon="workflow" label={t("nav.templateGen")} tone="orange" dataSlot={2} active={focusIndex() === 2} onClick={() => props.onNavigate("templateGen")} />
      <HomeDockButton icon="settings" label={t("nav.settings")} tone="gray" dataSlot={3} active={focusIndex() === 3} onClick={() => props.onNavigate("system")} />
      <HomeDockButton icon="tools" label={t("nav.tools")} tone="gold" dataSlot={4} active={focusIndex() === 4} onClick={() => props.onNavigate("tools")} />
      <HomeDockButton icon="agent" label={t("nav.agentModes")} tone="mint" dataSlot={5} active={focusIndex() === 5} onClick={() => props.onNavigate("agentModes")} />
      <HomeDockButton icon="api" label={t("nav.llmApi")} tone="violet" dataSlot={6} active={focusIndex() === 6} onClick={() => props.onNavigate("llmApi")} />
    </div>
  )
}

