// k6 WebSocket load test for jigtable realtime (MVP draft).
//
// Protocol:
//   - upgrade at wss://<host>/api/jigsaw/ws (no token in URL)
//   - first message must be room:join { roomId, sessionToken }
//   - get a session token from POST /api/sessions (body: { name, color })
//
// Run (ramp the VUS in steps: 100 -> 250 -> 500 -> 1000):
//
//   k6 run \
//     -e WS_URL=wss://api.jigtable.ru/api/jigsaw/ws \
//     -e ROOM_ID=load-test-room \
//     -e SESSION_TOKEN=<token from /api/sessions> \
//     -e VUS=100 \
//     -e EVENT_INTERVAL_MS=1000 \
//     -e DURATION=2m \
//     load/ws.js
//
// Without SESSION_TOKEN the socket still opens (counts as a connection and
// inbound message), so you can stress raw WS capacity, but it won't join a
// room and won't exercise broadcast/fanout.

import ws from "k6/ws"
import { check, sleep } from "k6"

const vus = Number(__ENV.VUS || 100)
const eventIntervalMs = Number(__ENV.EVENT_INTERVAL_MS || 1000)
const roomId = __ENV.ROOM_ID || "load-test-room"
const sessionToken = __ENV.SESSION_TOKEN || ""

export const options = {
  scenarios: {
    ws_load: {
      executor: "constant-vus",
      vus,
      duration: __ENV.DURATION || "2m",
    },
  },
}

export default function () {
  const url = __ENV.WS_URL

  const response = ws.connect(url, {}, function (socket) {
    socket.on("open", function () {
      if (sessionToken) {
        socket.send(
          JSON.stringify({
            type: "room:join",
            roomId,
            sessionToken,
          })
        )
      }

      socket.setInterval(function () {
        socket.send(
          JSON.stringify({
            type: "cursor:move",
            x: Math.random() * 1000,
            y: Math.random() * 1000,
          })
        )
      }, eventIntervalMs)
    })

    socket.on("message", function () {
      // no-op
    })

    socket.setTimeout(function () {
      socket.close()
    }, 60_000)
  })

  check(response, {
    connected: (r) => r && r.status === 101,
  })

  sleep(1)
}
