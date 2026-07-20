import type { Room } from "./types"

export interface RoomStore {
  get(roomId: string): Promise<Room | null>
  save(room: Room): Promise<void>
  delete(roomId: string): Promise<void>
}
