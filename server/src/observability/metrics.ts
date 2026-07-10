import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "prom-client"

const ALLOWED_WS_ERROR_REASONS = new Set<string>([
  "invalid_payload",
  "handler_error",
  "send_error",
  "auth_error",
  "room_not_found",
  "unknown",
])

const ALLOWED_WS_DISCONNECT_REASONS = new Set<string>([
  "client_close",
  "server_close",
  "auth_failed",
  "idle_timeout",
  "transport_error",
  "unknown",
])

export function normalizeWsErrorReason(value: unknown): string {
  if (typeof value !== "string") {
    return "unknown"
  }

  return ALLOWED_WS_ERROR_REASONS.has(value) ? value : "unknown"
}

export function normalizeWsDisconnectReason(value: unknown): string {
  if (typeof value !== "string") {
    return "unknown"
  }

  return ALLOWED_WS_DISCONNECT_REASONS.has(value) ? value : "unknown"
}

export const metricsRegistry = new Registry()

collectDefaultMetrics({
  register: metricsRegistry,
  prefix: "jigtable_",
})

export const wsConnectionsCurrent = new Gauge({
  name: "jigtable_ws_connections_current",
  help: "Current active WebSocket connections",
  registers: [metricsRegistry],
})

export const wsUsersCurrent = new Gauge({
  name: "jigtable_ws_users_current",
  help: "Current unique active WebSocket users",
  registers: [metricsRegistry],
})

export const wsRoomsCurrent = new Gauge({
  name: "jigtable_ws_rooms_current",
  help: "Current active WebSocket rooms",
  registers: [metricsRegistry],
})

export const wsMessagesInTotal = new Counter({
  name: "jigtable_ws_messages_in_total",
  help: "Total inbound WebSocket messages",
  labelNames: ["event"],
  registers: [metricsRegistry],
})

export const wsMessagesOutTotal = new Counter({
  name: "jigtable_ws_messages_out_total",
  help: "Total outbound WebSocket messages",
  labelNames: ["event"],
  registers: [metricsRegistry],
})

export const wsMessageErrorsTotal = new Counter({
  name: "jigtable_ws_message_errors_total",
  help: "Total WebSocket message handling errors",
  labelNames: ["event", "reason"],
  registers: [metricsRegistry],
})

export const wsDisconnectsTotal = new Counter({
  name: "jigtable_ws_disconnects_total",
  help: "Total WebSocket disconnects",
  labelNames: ["reason"],
  registers: [metricsRegistry],
})

export const wsBroadcastFanoutTotal = new Counter({
  name: "jigtable_ws_broadcast_fanout_total",
  help: "Total broadcast recipients across realtime events",
  labelNames: ["event"],
  registers: [metricsRegistry],
})

export const wsMessageHandleDuration = new Histogram({
  name: "jigtable_ws_message_handle_duration_seconds",
  help: "WebSocket message handler duration in seconds",
  labelNames: ["event"],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2],
  registers: [metricsRegistry],
})

export const wsPayloadBytes = new Histogram({
  name: "jigtable_ws_payload_bytes",
  help: "WebSocket payload size in bytes",
  labelNames: ["direction", "event"],
  buckets: [64, 256, 1024, 4096, 16_384, 65_536, 262_144],
  registers: [metricsRegistry],
})

const ALLOWED_WS_EVENTS = new Set<string>([
  // client -> server
  "room:join",
  "room:request_state",
  "session:pause",
  "session:resume",
  "group:grab",
  "group:move",
  "group:drop",
  "group:release",
  "groups:arrange",
  "room:lock-toggle",
  "room:ping",
  "cursor:move",
  "cursor:hide",
  // server -> client
  "error",
  "room:state",
  "room:pinged",
  "cursor:hidden",
  "player:left",
  "stats:updated",
  "player:joined",
  "player:updated",
  "group:locked",
  "room:lock-rejected",
  "room:lock-updated",
  "group:moved",
  "groups:merged",
  "pieces:placed",
  "group:unlocked",
  "cursor:moved",
  "groups:arranged",
  "session:paused",
  "session:resumed",
])

export function normalizeWsEvent(value: unknown): string {
  if (typeof value !== "string") {
    return "unknown"
  }

  return ALLOWED_WS_EVENTS.has(value) ? value : "unknown"
}

export function payloadByteLength(raw: string | Buffer | unknown): number {
  if (typeof raw === "string") {
    return Buffer.byteLength(raw, "utf8")
  }

  if (raw instanceof Buffer) {
    return raw.byteLength
  }

  if (raw instanceof ArrayBuffer) {
    return raw.byteLength
  }

  if (raw && typeof raw === "object" && "byteLength" in raw) {
    return (raw as { byteLength: number }).byteLength
  }

  return 0
}
