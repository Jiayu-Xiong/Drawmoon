import type { ParentProps } from "solid-js"

import { I18nProvider } from "./i18n"
import "./styles/shared/index.css"

export function AppLayout(props: ParentProps) {
  return <I18nProvider>{props.children}</I18nProvider>
}
