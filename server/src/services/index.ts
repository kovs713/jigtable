import {
  DrizzleAuthSessionRepository,
  DrizzleCompositionRepository,
  DrizzleHistoryRepository,
  DrizzlePlayerSessionRepository,
  DrizzleTelegramAccessRepository,
  DrizzleUserRepository,
} from "@/db/repositories"
import {
  AuthService,
  TelegramAuthVerifier,
  WhitelistTelegramAccessPolicy,
  authTokenCodec,
} from "./auth"
import { CompositionService } from "./composition/composition.service"
import { HistoryService } from "./history"
import { PlayerSessionService } from "./player-session"
import type { RoomMetrics, RoomPublisher } from "./room"
import { RoomManager } from "./room"

export type CreateServicesDependencies = {
  roomPublisher: RoomPublisher
  roomMetrics: RoomMetrics
}

export function createServices({
  roomPublisher,
  roomMetrics,
}: CreateServicesDependencies): Services {
  const playerSessions = new PlayerSessionService(
    new DrizzlePlayerSessionRepository()
  )
  const history = new HistoryService(new DrizzleHistoryRepository())
  const rooms = new RoomManager({
    sessions: playerSessions,
    history,
    publisher: roomPublisher,
    metrics: roomMetrics,
  })
  const auth = new AuthService({
    users: new DrizzleUserRepository(),
    sessions: new DrizzleAuthSessionRepository(),
    telegramAccess: new WhitelistTelegramAccessPolicy({
      repository: new DrizzleTelegramAccessRepository(),
      adminTelegramId: readAdminTelegramId(),
    }),
    tokens: authTokenCodec,
  })
  const telegramAuth = new TelegramAuthVerifier({
    botToken: process.env.BOT_TOKEN,
  })
  const composition = new CompositionService(new DrizzleCompositionRepository())

  return {
    playerSessions,
    history,
    rooms,
    composition,
    auth,
    telegramAuth,
  }
}

export type Services = {
  playerSessions: PlayerSessionService
  history: HistoryService
  rooms: RoomManager
  composition: CompositionService
  auth: AuthService
  telegramAuth: TelegramAuthVerifier
}

function readAdminTelegramId(): number | undefined {
  const value = Number(process.env.ADMIN_USER_ID)

  return Number.isSafeInteger(value) && value > 0 ? value : undefined
}
