import { useRef, useState, type MouseEvent, type ReactNode } from "react"

import "./privacy-page.css"

const SECTIONS = [
  { id: "overview", label: "overview" },
  { id: "data-i-process", label: "data i process" },
  { id: "how-i-use-data", label: "how i use data" },
  { id: "storage", label: "storage" },
  { id: "third-party-services", label: "third-party services" },
  { id: "contact", label: "contact" },
] as const

export default function PrivacyPage() {
  const [activeId, setActiveId] = useState<string>("overview")
  const scrollRef = useRef<HTMLElement>(null)

  function handleSectionClick(
    event: MouseEvent<HTMLAnchorElement>,
    id: string
  ) {
    event.preventDefault()

    setActiveId(id)

    const target = document.getElementById(id)

    if (!target) return

    target.scrollIntoView({
      behavior: "smooth",
      block: "start",
    })

    window.history.pushState(null, "", `#${id}`)
  }

  return (
    <main className="privacy-page">
      <header className="privacy-page__header glass corner-brackets">
        <div className="privacy-page__brand">
          <div className="privacy-page__logo">J</div>

          <div className="privacy-page__brand-content">
            <div className="privacy-page__brand-title">
              jigtable privacy policy
            </div>
            <p className="privacy-page__brand-subtitle">
              tg bot and multiplayer jigsaw web app
            </p>
          </div>
        </div>

        <a
          href="/"
          className="privacy-page__back-link"
          aria-label="Back to application"
        >
          <span aria-hidden>←</span>
          <span>back to app</span>
        </a>
      </header>

      <div className="privacy-page__body">
        <aside className="privacy-page__sidebar glass-sidebar corner-brackets">
          <div className="privacy-page__sidebar-header">
            <p className="privacy-page__sidebar-title">sections</p>
            <p className="privacy-page__sidebar-badge">public</p>
          </div>

          <nav
            aria-label="Policy sections"
            className="privacy-page__toc thin-scrollbar"
          >
            <ol className="privacy-page__toc-list">
              {SECTIONS.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    onClick={(event) => handleSectionClick(event, s.id)}
                    aria-current={activeId === s.id ? "true" : undefined}
                    className={
                      activeId === s.id
                        ? "privacy-page__toc-link privacy-page__toc-link--active"
                        : "privacy-page__toc-link"
                    }
                  >
                    <span className="privacy-page__toc-index">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>{s.label}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <section
          ref={scrollRef}
          className="privacy-page__content thin-scrollbar"
        >
          <nav
            aria-label="Policy sections (mobile)"
            className="privacy-page__mobile-nav"
          >
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={(event) => handleSectionClick(event, s.id)}
                className={
                  activeId === s.id
                    ? "privacy-page__mobile-link privacy-page__mobile-link--active"
                    : "privacy-page__mobile-link"
                }
              >
                {s.label}
              </a>
            ))}
          </nav>

          <article className="privacy-page__article glass corner-brackets">
            <header className="privacy-page__article-header">
              <div className="privacy-page__meta">
                <span>document</span>
                <span className="privacy-page__meta-dot" />
                <span>public</span>
              </div>

              <h1 className="privacy-page__title">
                privacy policy for jigtable
              </h1>
            </header>

            <div className="privacy-page__sections">
              <section id="overview" className="privacy-page__section">
                <SectionHeader index="01" title="overview" />
                <p className="privacy-page__muted">
                  jigtable is a Telegram bot and web app that lets users create
                  and solve multiplayer jigsaw puzzles from images.
                </p>
              </section>

              <section id="data-i-process" className="privacy-page__section">
                <SectionHeader index="02" title="data i process" />
                <ul className="privacy-page__list">
                  <ListItem>
                    tg user ID, username, first name, and related tg login data.
                  </ListItem>
                  <ListItem>
                    images sent to the bot or uploaded through the web editor.
                  </ListItem>
                  <ListItem>
                    puzzle rooms, puzzle state, solve history, and basic
                    interaction data needed to run the service.
                  </ListItem>
                </ul>
              </section>

              <section id="how-i-use-data" className="privacy-page__section">
                <SectionHeader index="03" title="how i use this data" />
                <ul className="privacy-page__list">
                  <ListItem>to create puzzle rooms.</ListItem>
                  <ListItem>
                    to let users verify images in the web editor.
                  </ListItem>
                  <ListItem>
                    to let users invite friends and solve puzzles together.
                  </ListItem>
                  <ListItem>
                    to maintain user profiles and puzzle history.
                  </ListItem>
                  <ListItem>
                    to prevent abuse and keep the service working reliably.
                  </ListItem>
                </ul>

                <p className="privacy-page__muted privacy-page__paragraph">
                  images and puzzle data are used only to provide jigtable
                  functionality. i do not sell user data.
                </p>
              </section>

              <section id="storage" className="privacy-page__section">
                <SectionHeader index="04" title="data storage" />
                <p className="privacy-page__muted">
                  data may be stored on jigtable servers for as long as needed
                  to provide the service, maintain puzzle history, debug issues,
                  or prevent abuse.
                </p>
              </section>

              <section
                id="third-party-services"
                className="privacy-page__section"
              >
                <SectionHeader index="05" title="third-party services" />
                <p className="privacy-page__muted">
                  jigtable uses tg for bot interaction and authentication. the
                  web editor may also process basic technical data such as IP
                  address, browser information, and request logs.
                </p>
              </section>

              <section id="contact" className="privacy-page__section">
                <SectionHeader index="06" title="contact" />
                <p className="privacy-page__muted">
                  for privacy questions or data removal requests, contact{" "}
                  <a
                    href="https://t.me/kovs713"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="privacy-page__text-link"
                  >
                    @kovs713
                  </a>
                  .
                </p>
              </section>
            </div>
          </article>
        </section>
      </div>

      <footer className="privacy-page__footer glass">
        <div className="privacy-page__footer-label">
          <div className="privacy-page__footer-dot" aria-hidden="true" />
          <span className="privacy-page__footer-text">public policy page</span>
        </div>

        <time dateTime="2026-07-09" className="privacy-page__updated">
          Last updated: 2026-07-09
        </time>
      </footer>
    </main>
  )
}

function SectionHeader({ index, title }: { index: string; title: string }) {
  return (
    <div className="privacy-page__section-header">
      <span className="privacy-page__section-index" aria-hidden="true">
        {index}
      </span>

      <h2 className="privacy-page__section-title">{title}</h2>
    </div>
  )
}

function ListItem({ children }: { children: ReactNode }) {
  return (
    <li className="privacy-page__list-item">
      <span aria-hidden className="privacy-page__list-marker" />
      <span>{children}</span>
    </li>
  )
}
