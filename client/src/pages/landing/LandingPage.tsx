import { DEFAULT_JIGSAW_CONFIG, getJigsawBounds } from "@jigtable/core/config"
import { createJigsawState } from "@jigtable/core/generate"
import { countPlacedPieces, translateGroup } from "@jigtable/core/groups"
import { tracePiecePath } from "@jigtable/core/piece-path"
import type {
  JigsawConfig,
  PieceDefinition,
  PiecePathSink,
} from "@jigtable/core/types"

import "./landing-page.css"

const PREVIEW_JIGSAW_CONFIG = {
  ...DEFAULT_JIGSAW_CONFIG,
  rows: 4,
  cols: 5,
  pieceWidth: 80,
  pieceHeight: 80,
} satisfies JigsawConfig

function getPiecePath(definition: PieceDefinition): string {
  const commands: string[] = []
  const sink: PiecePathSink = {
    moveTo(x, y) {
      commands.push(`M ${x} ${y}`)
    },
    lineTo(x, y) {
      commands.push(`L ${x} ${y}`)
    },
    bezierCurveTo(control1X, control1Y, control2X, control2Y, x, y) {
      commands.push(
        `C ${control1X} ${control1Y} ${control2X} ${control2Y} ${x} ${y}`
      )
    },
    closePath() {
      commands.push("Z")
    },
  }

  tracePiecePath(definition, sink)
  return commands.join(" ")
}

function createPreviewJigsawState() {
  const state = createJigsawState(PREVIEW_JIGSAW_CONFIG)

  for (const piece of Object.values(state.pieces)) {
    piece.placed = true
  }

  const firstLoosePiece = state.pieces["piece-1-2"]
  const secondLoosePiece = state.pieces["piece-2-4"]

  if (firstLoosePiece) {
    translateGroup(state, firstLoosePiece.groupId, -30, 40)
  }

  if (secondLoosePiece) {
    translateGroup(state, secondLoosePiece.groupId, 20, -30)
  }

  return state
}

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
    description: "Check the received images and confirm them.",
  },
  {
    index: "03",
    scope: "web editor",
    label: "save composition",
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
        <span className="landing-page__brand-content">
          <span className="landing-page__brand-name">jigtable</span>
          <span className="landing-page__brand-description">
            collaborative jigsaw workspace
          </span>
        </span>

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

          <JigsawAppWindow />
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

// Компонент с реальным пазлом
function JigsawAppWindow() {
  const state = createPreviewJigsawState()
  const board = getJigsawBounds(state.config)
  const tabDepth =
    (3 * (state.config.tabSizePercent / 200) +
      state.config.jitterPercent / 100) *
    Math.max(state.config.pieceWidth, state.config.pieceHeight)
  const padding = Math.ceil(tabDepth + 40)
  const placedPieces = countPlacedPieces(state)
  const totalPieces = Object.keys(state.pieces).length
  const progress = Math.round((placedPieces / totalPieces) * 100)

  return (
    <div
      className="landing-page__preview glass corner-brackets"
      aria-label="Jigtable multiplayer room preview"
    >
      <header className="landing-page__preview-header">
        <div className="landing-page__preview-heading">
          <span className="landing-page__preview-indicator" />
          <span>workspace preview</span>
        </div>
        <span className="landing-page__room-status">
          <span /> live
        </span>
      </header>

      <div className="landing-page__jigsaw-container">
        <svg
          width="100%"
          height="100%"
          viewBox={`${board.x - padding} ${board.y - padding} ${board.width + padding * 2} ${board.height + padding * 2}`}
          className="landing-page__jigsaw-svg"
        >
          <defs>
            <filter
              id="piece-shadow"
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <feDropShadow
                dx="0"
                dy="4"
                stdDeviation="4"
                floodColor="var(--foreground)"
                floodOpacity="0.15"
              />
            </filter>
          </defs>

          {Object.values(state.definitions).map((definition) => {
            const piece = state.pieces[definition.id]

            if (!piece) {
              return null
            }

            const rotation =
              definition.id === "piece-1-2"
                ? -4
                : definition.id === "piece-2-4"
                  ? 3
                  : 0

            return (
              <path
                key={definition.id}
                d={getPiecePath(definition)}
                transform={`translate(${piece.x}, ${piece.y}) rotate(${rotation} ${definition.width / 2} ${definition.height / 2})`}
                fill="var(--primary)"
                stroke="var(--background)"
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                filter="url(#piece-shadow)"
              />
            )
          })}
        </svg>

        <PreviewCursor name="kovs713" className="landing-page__cursor--one" />
        <PreviewCursor name="xwinta" className="landing-page__cursor--two" />
      </div>

      <footer className="landing-page__panel-footer">
        <span>
          {placedPieces} / {totalPieces} pieces
        </span>
        <span>{progress}%</span>
      </footer>
    </div>
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
        viewBox="0 0 16 22"
        focusable="false"
      >
        <path d="M 1 1 L 1 16 L 4.5 12.5 L 7 19 L 9 18 L 6.5 12 L 12 12 Z" />
      </svg>
      <span className="landing-page__cursor-label">{name}</span>
    </div>
  )
}
