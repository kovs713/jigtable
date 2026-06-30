import type { Context, Filter, SessionFlavor } from "grammy"

export interface SessionData {
  photos: string[]
  isStarted: boolean
  activeBatchId?: string
}

export type BotContext = Context & SessionFlavor<SessionData>

export type PhotoContext = Filter<BotContext, "message:photo">

export type StickerContext = Filter<BotContext, "message:sticker">
