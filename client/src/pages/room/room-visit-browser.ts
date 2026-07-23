import { JIGSAW_CONFIG_2000 } from "@jigtable/core/config"

import {
  fetchJigsawRoomResult,
  fetchJigsawRoomSnapshot,
} from "@/features/room/data"
import { createJigsawMultiplayerClient } from "@/features/room/multiplayer"
import {
  createLocalJigsawSession,
  readLocalJigsawSession,
  restoreJigsawSession,
  saveJigsawSessionProfile,
  saveLocalJigsawSession,
} from "@/features/session/session"

import { createJigsawRoomCanvas } from "./pixi/room-canvas"
import {
  createRoomVisit,
  type EnterRoomVisitOptions,
  type RoomVisit,
  type RoomVisitDependencies,
} from "./room-visit"

const productionDependencies: RoomVisitDependencies = {
  isDevelopment: import.meta.env.DEV,
  fallbackImageUrl: "/test_jigsaw.png",
  fallbackConfig: JIGSAW_CONFIG_2000,
  readSession: readLocalJigsawSession,
  createSession: createLocalJigsawSession,
  saveSession(session) {
    try {
      saveLocalJigsawSession(session)
      return null
    } catch (error) {
      return error instanceof Error ? error.message : "Session storage failed"
    }
  },
  restoreSession: restoreJigsawSession,
  saveProfile: saveJigsawSessionProfile,
  fetchSnapshot: fetchJigsawRoomSnapshot,
  fetchResult: fetchJigsawRoomResult,
  createCanvas: createJigsawRoomCanvas,
  createMultiplayer: createJigsawMultiplayerClient,
  now: Date.now,
  setTimeout(callback, durationMs) {
    return setTimeout(callback, durationMs)
  },
  clearTimeout,
  setInterval(callback, durationMs) {
    return setInterval(callback, durationMs)
  },
  clearInterval,
}

export function enterRoomVisit(options: EnterRoomVisitOptions): RoomVisit {
  return createRoomVisit(options, productionDependencies)
}
