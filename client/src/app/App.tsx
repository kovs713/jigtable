import { lazy } from "react"

import { AppNavigation } from "@/features/navigation/AppNavigation"

import { matchRoute } from "./routes"

const LandingPage = lazy(() => import("@/pages/landing/LandingPage"))
const PrivacyPage = lazy(() => import("@/pages/privacy/PrivacyPage"))
const EditorPage = lazy(() => import("@/pages/editor/EditorPage"))
const ProfilePage = lazy(() => import("@/pages/profile/ProfilePage"))
const RoomPage = lazy(() => import("@/pages/room/RoomPage"))
const RoomCreatePage = lazy(() => import("@/pages/room-create/RoomCreatePage"))
const RoomViewPage = lazy(() => import("@/pages/room-view/RoomViewPage"))

export function App() {
  const route = matchRoute(window.location.pathname)
  let page

  switch (route.name) {
    case "privacy":
      page = <PrivacyPage />
      break

    case "room.create":
      page = <RoomCreatePage />
      break

    case "profile":
      page = <ProfilePage />
      break

    case "profile.history.item":
      page = <RoomViewPage roomId={route.roomId} />
      break

    case "room.solve":
      page = <RoomPage roomId={route.roomId} />
      break

    case "editor":
      page = <EditorPage />
      break

    case "landing":
      page = <LandingPage />
      break
  }

  return (
    <>
      {page}
      <AppNavigation route={route} />
    </>
  )
}
