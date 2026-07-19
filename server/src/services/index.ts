import { LIMITS } from "@/config"
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
import { getRedisClient, RedisCache } from "./redis"
import {
  RedisRoomStore,
  RoomManager,
  type RoomMetrics,
  type RoomPublisher,
} from "./room"

export type CreateServicesDependencies = {
  roomPublisher: RoomPublisher
  roomMetrics: RoomMetrics
}

export function createServices({
  roomPublisher,
  roomMetrics,
}: CreateServicesDependencies): Services {
  const redis = getRedisClient()
  const playerSessions = new PlayerSessionService(
    new DrizzlePlayerSessionRepository(
      new RedisCache(redis, "player-session", 30 * 24 * 60 * 60)
    )
  )
  const history = new HistoryService(new DrizzleHistoryRepository())
  const roomStore = new RedisRoomStore(
    redis,
    Math.ceil(LIMITS.jigsaw.roomTtlMs / 1000)
  )
  const rooms = new RoomManager({
    sessions: playerSessions,
    history,
    publisher: roomPublisher,
    metrics: roomMetrics,
    store: roomStore,
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
