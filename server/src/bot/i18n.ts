import { I18n } from "@grammyjs/i18n"
import { fileURLToPath } from "bun"

import type { BotContext } from "@/bot/types"

export const DEFAULT_LOCALE = "en"
export const SUPPORTED_LOCALES = ["en", "ru"] as const

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export const i18n = new I18n<BotContext>({
  defaultLocale: DEFAULT_LOCALE,
  directory: fileURLToPath(new URL("./locales", import.meta.url)),
  localeNegotiator: (ctx) => normalizeLocale(ctx.from?.language_code),
  fluentBundleOptions: {
    useIsolating: false,
  },
})

function normalizeLocale(languageCode: string | undefined): SupportedLocale {
  return languageCode?.toLowerCase().startsWith("ru") ? "ru" : "en"
}
