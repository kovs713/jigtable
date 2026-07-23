import { afterEach, describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"

import { EditorLoadingSkeleton } from "../src/canvas-editor/components/EditorLoadingSkeleton"
import { ProfileLoadingSkeleton } from "../src/pages/profile/ProfileLoadingSkeleton"
import { RoomCreateLoadingSkeleton } from "../src/pages/room-create/RoomCreateLoadingSkeleton"

const savedAuthSession = JSON.stringify({
  token: "auth-token",
  expiresAt: "2100-01-01T00:00:00.000Z",
  user: {
    id: "user-1",
    telegramId: "1001",
    username: "player",
    firstName: "Jig",
    lastName: "Table",
    photoUrl: null,
    displayName: "Jig Table",
    color: "#22c55e",
    xpTotal: 0,
    xpUpdatedAt: null,
  },
})
const originalLocalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage"
)
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window")

afterEach(() => {
  restoreGlobal("localStorage", originalLocalStorage)
  restoreGlobal("window", originalWindow)
})

describe("loading skeletons", () => {
  test.each([
    ["editor", <EditorLoadingSkeleton />],
    ["profile", <ProfileLoadingSkeleton />],
    ["room creation", <RoomCreateLoadingSkeleton />],
  ])("marks the %s screen as busy", (_name, skeleton) => {
    const markup = renderToStaticMarkup(skeleton)

    expect(markup).toContain('aria-busy="true"')
    expect(markup).toContain('role="status"')
    expect(markup).toContain('data-slot="skeleton"')
  })

  test.each([
    ["editor", renderEditorPage, "no images"],
    ["profile", renderProfilePage, "Guest profile"],
    ["room creation", renderRoomCreatePage, "no saved builds yet"],
  ])(
    "shows the %s skeleton while saved auth is validated",
    async (_name, renderPage, falseEmptyContent) => {
      installSavedAuthSession()

      const markup = await renderPage()

      expect(markup).toContain('aria-busy="true"')
      expect(markup).toContain('data-slot="skeleton"')
      expect(markup).not.toContain(falseEmptyContent)
    }
  )
})

async function renderEditorPage(): Promise<string> {
  const { CanvasEditor } = await import("../src/canvas-editor/CanvasEditor")
  return renderToStaticMarkup(<CanvasEditor />)
}

async function renderProfilePage(): Promise<string> {
  const { ProfilePage } = await import("../src/pages/profile/ProfilePage")
  return renderToStaticMarkup(<ProfilePage />)
}

async function renderRoomCreatePage(): Promise<string> {
  const { RoomCreatePage } =
    await import("../src/pages/room-create/RoomCreatePage")
  return renderToStaticMarkup(<RoomCreatePage />)
}

function installSavedAuthSession(): void {
  const values = new Map<string, string>([
    ["jigsaw-room-auth-v2", savedAuthSession],
  ])
  const storage: Storage = {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  }

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  })
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      history: { replaceState: () => undefined },
      location: new URL("https://localhost/"),
      open: () => null,
    },
  })
}

function restoreGlobal(
  name: "localStorage" | "window",
  descriptor: PropertyDescriptor | undefined
): void {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor)
  } else {
    Reflect.deleteProperty(globalThis, name)
  }
}
