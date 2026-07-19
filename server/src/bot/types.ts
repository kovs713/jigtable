import type { I18nFlavor } from "@grammyjs/i18n"
import type { Context, Filter, SessionFlavor } from "grammy"

export interface UploadedImage {
  id: string
  fileId: string
  fileUniqueId: string
  width: number
  height: number
  fileSize?: number
  sourceMessageId: number
  mediaGroupId?: string
  status: "active" | "deleted"
  createdAt: number
}

export interface UploadSession {
  images: UploadedImage[]
  duplicateCount: number
  seenFileUniqueIds: string[]
  statusRefreshTimer?: ReturnType<typeof setInterval>
  lastStatusRefreshAt?: number
  viewerImageId?: string
  viewerMessageId?: number
  statusMessageId?: number
}

export interface SessionData {
  __language_code?: string
  mainMenuShown?: boolean
  navigationMessageId?: number
  staleMessageIds?: number[]

  photos: string[]
  isStarted: boolean
  activeCompositionId?: string
  upload?: UploadSession
}

export type BotContext = Context & SessionFlavor<SessionData> & I18nFlavor
export type PhotoContext = Filter<BotContext, "message:photo">
export type StickerContext = Filter<BotContext, "message:sticker">
export type CallbackQueryContext = Filter<BotContext, "callback_query:data">
