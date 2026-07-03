import { useI18n, type Locale } from "../i18n"

export function LanguageSwitch(props: { compact?: boolean }) {
  const { t, locale, setLocale } = useI18n()
  return (
    <div class="wf-lang-switch" classList={{ "wf-lang-switch--compact": props.compact }} role="group" aria-label={t("settings.language")}>
      <button type="button" classList={{ active: locale() === "en" }} onClick={() => setLocale("en" as Locale)}>
        {props.compact ? "EN" : t("run.langEn")}
      </button>
      <button type="button" classList={{ active: locale() === "zh" }} onClick={() => setLocale("zh" as Locale)}>
        {props.compact ? "中" : t("run.langZh")}
      </button>
    </div>
  )
}
