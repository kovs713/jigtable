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
}

export interface SessionData {
  photos: string[]
  isStarted: boolean
  activeBatchId?: string
  upload?: UploadSession
}

export type BotContext = Context & SessionFlavor<SessionData>
export type PhotoContext = Filter<BotContext, "message:photo">
export type StickerContext = Filter<BotContext, "message:sticker">
export type CallbackQueryContext = Filter<BotContext, "callback_query:data">
