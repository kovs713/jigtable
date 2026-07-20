import { and, asc, eq, sql } from "drizzle-orm"

import type {
  PersistedRoomEvent,
  RoomEventDraft,
} from "@jigtable/core/session-history"

import { db as defaultDb } from "@/db"
import { roomEventSequencesSchema, roomEventsSchema } from "@/db/schemas"

type Database = typeof defaultDb

export type AppendRoomEvent = RoomEventDraft

export interface RoomEventRepository {
  append(events: readonly AppendRoomEvent[]): Promise<PersistedRoomEvent[]>
  findByCommand(
    roomId: string,
    commandId: string
  ): Promise<PersistedRoomEvent[]>
  listRoomEvents(roomId: string): Promise<PersistedRoomEvent[]>
}

export class DrizzleRoomEventRepository implements RoomEventRepository {
  constructor(private readonly db: Database = defaultDb) {}

  async append(
    drafts: readonly AppendRoomEvent[]
  ): Promise<PersistedRoomEvent[]> {
    const orderedDrafts = [...drafts].sort(
      (left, right) => left.eventIndex - right.eventIndex
    )
    const { roomId, commandId } = validateDrafts(orderedDrafts)

    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${roomId}:${commandId}`}, 0))`
      )
      const existing = await selectCommandEvents(tx, roomId, commandId)

      if (existing.length > 0) {
        assertSameCommand(existing, orderedDrafts)
        return existing
      }

      const eventCount = orderedDrafts.length
      // The counter stores the next unallocated value; one upsert reserves the batch.
      const [counter] = await tx
        .insert(roomEventSequencesSchema)
        .values({
          roomId,
          nextSequence: eventCount + 1,
        })
        .onConflictDoUpdate({
          target: roomEventSequencesSchema.roomId,
          set: {
            nextSequence: sql`${roomEventSequencesSchema.nextSequence} + ${eventCount}`,
          },
        })
        .returning({
          nextSequence: roomEventSequencesSchema.nextSequence,
        })

      if (!counter) {
        throw new Error("Room event sequence allocation failed")
      }

      const firstSequence = counter.nextSequence - eventCount
      const createdAt = new Date()
      const rows = orderedDrafts.map((draft, index) => ({
        ...draft,
        id: draft.id ?? crypto.randomUUID(),
        sequence: firstSequence + index,
        createdAt,
      }))

      const inserted = await tx
        .insert(roomEventsSchema)
        .values(rows)
        .onConflictDoNothing()
        .returning()

      if (inserted.length === eventCount) {
        return inserted.map(toPersistedRoomEvent)
      }

      const concurrent = await selectCommandEvents(tx, roomId, commandId)
      assertSameCommand(concurrent, orderedDrafts)
      return concurrent
    })
  }

  async findByCommand(
    roomId: string,
    commandId: string
  ): Promise<PersistedRoomEvent[]> {
    return selectCommandEvents(this.db, roomId, commandId)
  }

  async listRoomEvents(roomId: string): Promise<PersistedRoomEvent[]> {
    const rows = await this.db
      .select()
      .from(roomEventsSchema)
      .where(eq(roomEventsSchema.roomId, roomId))
      .orderBy(asc(roomEventsSchema.sequence))

    return rows.map(toPersistedRoomEvent)
  }
}

function validateDrafts(events: readonly AppendRoomEvent[]): {
  roomId: string
  commandId: string
} {
  const first = events[0]

  if (!first) {
    throw new Error("Room event batch cannot be empty")
  }

  const seenIndexes = new Set<number>()

  for (const event of events) {
    if (event.roomId !== first.roomId || event.commandId !== first.commandId) {
      throw new Error("Room event batch must share roomId and commandId")
    }

    if (!Number.isSafeInteger(event.eventIndex) || event.eventIndex < 0) {
      throw new Error("Room event index must be a non-negative integer")
    }

    if (seenIndexes.has(event.eventIndex)) {
      throw new Error("Room event indexes must be unique per command")
    }

    seenIndexes.add(event.eventIndex)
  }

  for (let index = 0; index < events.length; index += 1) {
    if (!seenIndexes.has(index)) {
      throw new Error("Room event indexes must be contiguous from zero")
    }
  }

  return { roomId: first.roomId, commandId: first.commandId }
}

function assertSameCommand(
  existing: readonly PersistedRoomEvent[],
  drafts: readonly AppendRoomEvent[]
): void {
  if (existing.length !== drafts.length) {
    throw new Error("Command replay has a different event count")
  }

  for (const draft of drafts) {
    const event = existing.find((item) => item.eventIndex === draft.eventIndex)

    if (
      !event ||
      event.eventType !== draft.eventType ||
      event.playerId !== draft.playerId ||
      event.userId !== draft.userId ||
      canonicalJson(event.payload) !== canonicalJson(draft.payload)
    ) {
      throw new Error("Command replay payload does not match persisted events")
    }
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)
    )
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`
  }

  return JSON.stringify(value)
}

async function selectCommandEvents(
  db: Pick<Database, "select">,
  roomId: string,
  commandId: string
): Promise<PersistedRoomEvent[]> {
  const rows = await db
    .select()
    .from(roomEventsSchema)
    .where(
      and(
        eq(roomEventsSchema.roomId, roomId),
        eq(roomEventsSchema.commandId, commandId)
      )
    )
    .orderBy(asc(roomEventsSchema.eventIndex))

  return rows.map(toPersistedRoomEvent)
}

function toPersistedRoomEvent(
  row: typeof roomEventsSchema.$inferSelect
): PersistedRoomEvent {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
  } as PersistedRoomEvent
}
