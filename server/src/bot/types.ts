import type { Context, Filter, SessionFlavor } from "grammy";

export interface SessionData {
  step?: number;
}

export type BotContext = Context & SessionFlavor<SessionData>;

export type PhotoContext = Filter<Context, "message:photo">;

export type StickerContext = Filter<Context, "message:sticker">;
