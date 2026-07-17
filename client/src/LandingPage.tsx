import "./landing-page.css"

const FEATURES = [
  {
    index: "01",
    title: "telegram intake",
    description:
      "Send images to @jigtable_bot and confirm the set directly in Telegram.",
  },
  {
    index: "02",
    title: "composition editor",
    description:
      "Open the generated link, review the image layout, and save the composition edits.",
  },
  {
    index: "03",
    title: "multiplayer room",
    description:
      "Create a puzzle room from the composition, share the link, and solve it together.",
  },
] as const

const WORKFLOW = [
  {
    index: "01",
    scope: "telegram",
    label: "send images",
    description: "Send one or several images to @jigtable_bot.",
  },
  {
    index: "02",
    scope: "telegram",
    label: "confirm selection",
    description: "Check the received images and confirm the batch.",
  },
  {
    index: "03",
    scope: "web editor",
    label: "Save composition edits",
    description: "Open the generated link and review the composition.",
  },
  {
    index: "04",
    scope: "web app",
    label: "create puzzle room",
    description: "Choose puzzle settings and create a multiplayer room.",
  },
  {
    index: "05",
    scope: "multiplayer",
    label: "invite players",
    description: "Share the room link and solve the puzzle together.",
  },
] as const

export default function LandingPage() {
  return (
    <main className="landing-page canvas-grid">
      <header className="landing-page__header glass">
        <a
          href="/rooms/new"
          className="landing-page__brand"
          aria-label="Jigtable home"
        >
          <span className="landing-page__logo" aria-hidden="true">
            J
          </span>
          <span className="landing-page__brand-content">
            <span className="landing-page__brand-name">jigtable</span>
            <span className="landing-page__brand-description">
              collaborative puzzle workspace
            </span>
          </span>
        </a>

        <nav className="landing-page__nav" aria-label="Main navigation">
          <a href="#workflow" className="landing-page__nav-link">
            workflow
          </a>
          <a href="#features" className="landing-page__nav-link">
            features
          </a>
          <a href="/privacy" className="landing-page__nav-link">
            privacy
          </a>
        </nav>

        <a
          href="https://t.me/jigtable_bot?start=landing_header"
          target="_blank"
          rel="noopener noreferrer"
          className="landing-page__header-action landing-page__button--secondary"
        >
          open telegram <span aria-hidden="true">↗</span>
        </a>
      </header>

      <div className="landing-page__content">
        <section className="landing-page__hero">
          <div className="landing-page__hero-copy">
            <div className="landing-page__eyebrow">
              <span className="landing-page__eyebrow-dot" aria-hidden="true" />
              <span>telegram to multiplayer jigsaw</span>
            </div>

            <h1 className="landing-page__title">
              send images.
              <br />
              build a composition.
              <br />
              <span>solve together.</span>
            </h1>

            <p className="landing-page__description">
              Send images to the Jigtable Telegram bot, confirm the selection,
              and open the generated composition in the web editor. When
              everything looks right, create a multiplayer puzzle room and
              invite other players.
            </p>

            <div className="landing-page__actions">
              <a
                href="https://t.me/jigtable_bot?start=landing_hero"
                target="_blank"
                rel="noopener noreferrer"
                className="landing-page__button landing-page__button--primary corner-brackets corner-brackets--accent"
              >
                <span>start with @jigtable_bot</span>{" "}
                <span aria-hidden="true">↗</span>
              </a>
              <a
                href="#workflow"
                className="landing-page__button landing-page__button--secondary"
              >
                <span>see workflow</span> <span aria-hidden="true">↓</span>
              </a>
            </div>

            <div className="landing-page__capabilities">
              <span>telegram image upload</span>
              <span>composition editor</span>
              <span>multiplayer rooms</span>
            </div>
          </div>

          <ProductPreview />
        </section>

        <section
          id="workflow"
          className="landing-page__workflow glass corner-brackets"
        >
          <header className="landing-page__section-header">
            <div>
              <p className="landing-page__section-kicker">workflow</p>
              <h2 className="landing-page__section-title">
                from images to a shared puzzle room
              </h2>
            </div>
            <span className="landing-page__section-status">05 steps</span>
          </header>

          <ol className="landing-page__workflow-list">
            {WORKFLOW.map((step) => (
              <li key={step.index} className="landing-page__workflow-step">
                <div className="landing-page__workflow-meta">
                  <span className="landing-page__workflow-index">
                    {step.index}
                  </span>
                  <span className="landing-page__workflow-scope">
                    {step.scope}
                  </span>
                </div>
                <div className="landing-page__workflow-content">
                  <span className="landing-page__workflow-label">
                    {step.label}
                  </span>
                  <p className="landing-page__workflow-description">
                    {step.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="features" className="landing-page__features">
          <header className="landing-page__section-header landing-page__section-header--outside">
            <div>
              <p className="landing-page__section-kicker">core tools</p>
              <h2 className="landing-page__section-title">
                one workflow, two connected spaces
              </h2>
            </div>
          </header>

          <div className="landing-page__feature-grid">
            {FEATURES.map((feature) => (
              <article
                key={feature.index}
                className="landing-page__feature glass corner-brackets"
              >
                <div className="landing-page__feature-meta">
                  <span>{feature.index}</span>
                  <span className="landing-page__feature-dot" />
                  <span>module</span>
                </div>
                <div className="landing-page__feature-content">
                  <h3 className="landing-page__feature-title">
                    {feature.title}
                  </h3>
                  <p className="landing-page__feature-description">
                    {feature.description}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-page__cta glass-elevated corner-brackets">
          <div className="landing-page__cta-copy">
            <p className="landing-page__section-kicker">new puzzle</p>
            <h2 className="landing-page__cta-title">
              start by sending your images
            </h2>
            <p className="landing-page__cta-description">
              Open the Telegram bot, send images for your composition, and
              follow the generated editor link.
            </p>
          </div>
          <a
            href="https://t.me/jigtable_bot?start=landing_footer"
            target="_blank"
            rel="noopener noreferrer"
            className="landing-page__button landing-page__button--primary corner-brackets corner-brackets--accent"
          >
            <span>open @jigtable_bot</span> <span aria-hidden="true">↗</span>
          </a>
        </section>

        <footer className="landing-page__footer">
          <div className="landing-page__footer-status">
            <span className="landing-page__footer-dot" aria-hidden="true" />
            <span>jigtable web application</span>
          </div>
          <div className="landing-page__footer-links">
            <a href="/privacy">privacy policy</a>
            <a
              href="https://t.me/kovs713"
              target="_blank"
              rel="noopener noreferrer"
            >
              contact
            </a>
          </div>
        </footer>
      </div>
    </main>
  )
}

function ProductPreview() {
  return (
    <div
      className="landing-page__preview glass corner-brackets"
      aria-label="Jigtable editor and multiplayer room preview"
    >
      <header className="landing-page__preview-header">
        <div className="landing-page__preview-heading">
          <span className="landing-page__preview-indicator" />
          <span>workspace preview</span>
        </div>
      </header>

      <div className="landing-page__preview-content">
        <TelegramPreview />
        <PreviewConnector />
        <EditorPreview />
        <PreviewConnector />
        <RoomPreview />
      </div>
    </div>
  )
}

function EditorPreview() {
  return (
    <section className="landing-page__editor-preview">
      <header className="landing-page__panel-header">
        <div>
          <p className="landing-page__panel-label">composition editor</p>
          <p className="landing-page__panel-meta">8 images / justified</p>
        </div>
        <span className="landing-page__panel-action">save edits</span>
      </header>

      <div className="landing-page__composition">
        <div className="landing-page__composition-image landing-page__composition-image--one">
          <span>01</span>
        </div>
        <div className="landing-page__composition-image landing-page__composition-image--two">
          <span>02</span>
        </div>
        <div className="landing-page__composition-image landing-page__composition-image--three">
          <span>03</span>
        </div>
        <div className="landing-page__composition-image landing-page__composition-image--four">
          <span>04</span>
        </div>
      </div>

      <footer className="landing-page__panel-footer">
        <span>canvas 1600 × 1200</span>
        <span>saved</span>
      </footer>
    </section>
  )
}

function RoomPreview() {
  const owners = [
    undefined,
    undefined,
    "one",
    "one",
    undefined,

    undefined,
    "two",
    "one",
    "one",
    undefined,

    "two",
    "two",
    "one",
    "three",
    "three",

    "two",
    undefined,
    undefined,
    "three",
    "three",
  ] as const

  return (
    <section className="landing-page__room-preview">
      <header className="landing-page__panel-header">
        <div>
          <p className="landing-page__panel-label">multiplayer room</p>
          <p className="landing-page__panel-meta">3 players connected</p>
        </div>

        <span className="landing-page__room-status">
          <span />
          live
        </span>
      </header>

      <div className="landing-page__puzzle-board">
        {owners.map((owner, index) => (
          <span
            key={index}
            className={
              owner
                ? `landing-page__puzzle-cell landing-page__puzzle-cell--${owner}`
                : "landing-page__puzzle-cell"
            }
          />
        ))}

        <PreviewCursor name="kovs" className="landing-page__cursor--one" />

        <PreviewCursor name="alex" className="landing-page__cursor--two" />
      </div>

      <footer className="landing-page__panel-footer">
        <span>47 / 120 pieces</span>
        <span>39%</span>
      </footer>
    </section>
  )
}

function PreviewCursor({
  name,
  className,
}: {
  name: string
  className: string
}) {
  return (
    <div className={`landing-page__cursor ${className}`} aria-hidden="true">
      <svg
        className="landing-page__cursor-pointer"
        viewBox="-1 -1 20 28"
        focusable="false"
      >
        <polygon points="0,0 0,20 5,15 9,25 13,23 9,13 17,13" />
      </svg>

      <span className="landing-page__cursor-label">{name}</span>
    </div>
  )
}

function PreviewConnector() {
  return (
    <div className="landing-page__preview-connector" aria-hidden="true">
      <span />
      <strong>↓</strong>
      <span />
    </div>
  )
}

function TelegramPreview() {
  return (
    <section className="landing-page__telegram-preview">
      <header className="landing-page__panel-header">
        <div>
          <p className="landing-page__panel-label">telegram bot</p>
          <p className="landing-page__panel-meta">@jigtable_bot</p>
        </div>
        <span className="landing-page__room-status">
          <span />
          ready
        </span>
      </header>

      <div className="landing-page__telegram-chat">
        <div className="landing-page__telegram-message">
          Send me the images you want to use.
        </div>
        <div className="landing-page__telegram-images">
          <span>01</span>
          <span>02</span>
          <span>03</span>
          <span>04</span>
        </div>
        <div className="landing-page__telegram-message">
          4 images received. Confirm this selection?
        </div>
        <div className="landing-page__telegram-confirm">confirm images</div>
      </div>

      <footer className="landing-page__panel-footer">
        <span>image batch</span>
        <span>confirmed</span>
      </footer>
    </section>
  )
}
