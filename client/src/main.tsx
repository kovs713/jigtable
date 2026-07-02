import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { ThemeProvider } from "@/components/theme-provider.tsx"
import App from "./App.tsx"
import "./index.css"
import JigsawProfileApp from "./jigsaw-room/JigsawProfileApp.tsx"
import JigsawRoomApp from "./jigsaw-room/JigsawRoomApp.tsx"
import JigsawRoomCreateApp from "./jigsaw-room/JigsawRoomCreateApp.tsx"

export function RootApp() {
  const { pathname } = window.location

  if (pathname === "/jigsaw/new") {
    return <JigsawRoomCreateApp />
  }

  if (pathname === "/profile" || pathname === "/jigsaw/profile") {
    return <JigsawProfileApp />
  }

  if (pathname.startsWith("/jigsaw/")) {
    const roomId = decodeURIComponent(pathname.slice("/jigsaw/".length))

    return <JigsawRoomApp roomId={roomId} />
  }

  if (pathname === "/jigsaw") {
    return <JigsawRoomApp />
  }

  return <App />
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <RootApp />
    </ThemeProvider>
  </StrictMode>
)
