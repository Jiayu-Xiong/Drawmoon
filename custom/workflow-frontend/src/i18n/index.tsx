import { createContext, createSignal, useContext, type ParentProps } from "solid-js"

import { en, zh, type MessageTree } from "./locales"
import type { Locale } from "./locales"

export type { Locale }

const STORAGE_KEY = "wf-ui-locale"
const catalogs: Record<Locale, MessageTree> = { en, zh }

function readLocale(): Locale {
  if (typeof localStorage === "undefined") return "en"
  return localStorage.getItem(STORAGE_KEY) === "zh" ? "zh" : "en"
}

function lookup(tree: MessageTree, key: string): string | undefined {
  const parts = key.split(".")
  let current: string | MessageTree | undefined = tree
  for (const part of parts) {
    if (!current || typeof current === "string") return undefined
    current = current[part]
  }
  return typeof current === "string" ? current : undefined
}

function format(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`))
}

export type I18nContextValue = {
  locale: () => Locale
  setLocale: (locale: Locale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue>()

export function I18nProvider(props: ParentProps) {
  const [locale, setLocaleSignal] = createSignal<Locale>(readLocale())
  if (typeof document !== "undefined") document.documentElement.lang = readLocale() === "zh" ? "zh-CN" : "en"
  const value: I18nContextValue = {
    locale,
    setLocale(next) {
      setLocaleSignal(next)
      if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, next)
      if (typeof document !== "undefined") document.documentElement.lang = next === "zh" ? "zh-CN" : "en"
    },
    t(key, vars) {
      const message = lookup(catalogs[locale()], key) ?? lookup(catalogs.en, key) ?? key
      return format(message, vars)
    },
  }
  return <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error("useI18n must be used within I18nProvider")
  return ctx
}
