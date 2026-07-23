import { useEffect, useRef, type ReactNode } from "react"

import type { AppRoute } from "@/app/routes"
import { paths } from "@/app/routes"

import "./navigation.css"

type NavigationItem = {
  label: string
  href: string
  icon: "home" | "editor" | "room" | "profile"
  active: (route: AppRoute) => boolean
}

const NAVIGATION_ITEMS: NavigationItem[] = [
  {
    label: "Home",
    href: paths.landing(),
    icon: "home",
    active: (route) => route.name === "landing",
  },
  {
    label: "Editor",
    href: paths.editor(),
    icon: "editor",
    active: (route) => route.name === "editor",
  },
  {
    label: "New room",
    href: paths.roomCreate(),
    icon: "room",
    active: (route) =>
      route.name === "room.create" || route.name === "room.solve",
  },
  {
    label: "Profile",
    href: paths.profile(),
    icon: "profile",
    active: (route) =>
      route.name === "profile" || route.name === "profile.history.item",
  },
]

export function AppNavigation({ route }: { route: AppRoute }) {
  const navigationRef = useRef<HTMLElement>(null)
  const backLink = getBackLink(route)

  useEffect(() => {
    function closeNavigation(event: PointerEvent) {
      const navigation = navigationRef.current
      const details = navigation?.querySelector("details")

      if (details?.open && !navigation?.contains(event.target as Node)) {
        details.open = false
      }
    }

    function closeNavigationOnEscape(event: KeyboardEvent) {
      const details = navigationRef.current?.querySelector("details")

      if (event.key === "Escape" && details?.open) {
        details.open = false
        details.querySelector("summary")?.focus()
      }
    }

    document.addEventListener("pointerdown", closeNavigation)
    document.addEventListener("keydown", closeNavigationOnEscape)

    return () => {
      document.removeEventListener("pointerdown", closeNavigation)
      document.removeEventListener("keydown", closeNavigationOnEscape)
    }
  }, [])

  return (
    <nav
      ref={navigationRef}
      className="app-navigation"
      aria-label="Application navigation"
    >
      <details className="app-navigation__menu">
        <summary className="app-navigation__trigger glass">
          <span className="app-navigation__mark" aria-hidden="true">
            J
          </span>
          <span className="app-navigation__trigger-label">menu</span>
          <span className="app-navigation__trigger-arrow" aria-hidden="true">
            ↑
          </span>
        </summary>

        <div className="app-navigation__panel glass-elevated corner-brackets">
          <header className="app-navigation__header">
            <strong>jigtable</strong>
            <span>go to</span>
          </header>

          {backLink ? (
            <div className="app-navigation__back">
              <NavigationLink href={backLink.href} label={backLink.label}>
                <NavigationIcon name="back" />
              </NavigationLink>
            </div>
          ) : null}

          <div className="app-navigation__links">
            {NAVIGATION_ITEMS.map((item) => (
              <NavigationLink
                key={item.href}
                href={item.href}
                label={item.label}
                active={item.active(route)}
              >
                <NavigationIcon name={item.icon} />
              </NavigationLink>
            ))}
          </div>
        </div>
      </details>
    </nav>
  )
}

function NavigationLink({
  href,
  label,
  active = false,
  children,
}: {
  href: string
  label: string
  active?: boolean
  children: ReactNode
}) {
  return (
    <a
      href={href}
      className="app-navigation__link"
      aria-current={active ? "page" : undefined}
      title={label}
    >
      {children}
      <span>{label}</span>
    </a>
  )
}

function getBackLink(route: AppRoute): { href: string; label: string } | null {
  switch (route.name) {
    case "privacy":
      return { href: paths.landing(), label: "Back home" }
    case "profile.history.item":
      return { href: paths.profile(), label: "Back to profile" }
    case "room.solve":
      return { href: paths.roomCreate(), label: "Back to rooms" }
    default:
      return null
  }
}

function NavigationIcon({ name }: { name: NavigationItem["icon"] | "back" }) {
  return (
    <svg
      className="app-navigation__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
    >
      {name === "back" ? (
        <>
          <path d="m10 6-6 6 6 6" />
          <path d="M4 12h16" />
        </>
      ) : null}
      {name === "home" ? (
        <>
          <path d="m4 10 8-6 8 6" />
          <path d="M6.5 9v11h11V9" />
          <path d="M10 20v-6h4v6" />
        </>
      ) : null}
      {name === "editor" ? (
        <>
          <rect x="4" y="4" width="16" height="16" />
          <path d="M4 9h16M9 9v11" />
          <path d="m12 16 2-3 3 4" />
        </>
      ) : null}
      {name === "room" ? (
        <>
          <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4z" />
          <path d="M13 13h3v3h4v4h-7z" />
        </>
      ) : null}
      {name === "profile" ? (
        <>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c.7-4 3-6 7-6s6.3 2 7 6" />
        </>
      ) : null}
    </svg>
  )
}
