export type AppRoute =
  | { name: "privacy" }
  | { name: "room.create" }
  | { name: "profile" }
  | { name: "profile.history.item"; roomId: string }
  | { name: "room.solve"; roomId: string }
  | { name: "home" }

export const paths = {
  home: () => "/",
  privacy: () => "/privacy",
  roomCreate: () => "/rooms/new",
  profile: () => "/profile",
  profileHistoryItem: (roomId: string) =>
    `/profile/history/${encodeURIComponent(roomId)}`,
  roomSolve: (roomId: string) => `/rooms/${encodeURIComponent(roomId)}`,
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

export function matchRoute(pathname: string): AppRoute {
  if (pathname === "/privacy") {
    return { name: "privacy" }
  }

  if (pathname === "/rooms/new") {
    return { name: "room.create" }
  }

  if (pathname === "/profile") {
    return { name: "profile" }
  }

  if (pathname.startsWith("/profile/history/")) {
    const rawRoomId = pathname.slice("/profile/history/".length)
    const roomId = safeDecode(rawRoomId)

    if (roomId) {
      return { name: "profile.history.item", roomId }
    }

    return { name: "home" }
  }

  if (pathname.startsWith("/rooms/")) {
    const rawRoomId = pathname.slice("/rooms/".length)
    const roomId = safeDecode(rawRoomId)

    if (roomId && roomId !== "new") {
      return { name: "room.solve", roomId }
    }

    return { name: "home" }
  }

  return { name: "home" }
}
