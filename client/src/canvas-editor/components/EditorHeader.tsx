import type { RefObject } from "react"

import type { AuthSession } from "@/features/auth/auth"
import type { UserCompositionItem } from "@/features/compositions/compositions"
import { cn } from "@/lib/utils"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"

import {
  formatCompositionMeta,
  formatCompositionTitle,
} from "../model/composition"
import type { CompositionRef, SelectedComposition } from "../model/types"

import "./EditorHeader.css"

type EditorHeaderProps = {
  itemCount: number
  compositions: UserCompositionItem[]
  selectedComposition: SelectedComposition | null
  remoteComposition: CompositionRef | null
  loadCode: string
  authSession: AuthSession | null
  authStatus: string
  authLoading: boolean
  telegramWidgetVisible: boolean
  telegramWidgetRef: RefObject<HTMLDivElement | null>
  createRoomUrl: string
  onLoadCodeChange: (value: string) => void
  onLoad: () => void
  onSelectComposition: (item: UserCompositionItem) => void
  onLogin: () => void
  onSave: () => void
  onDownload: () => void
}

export function EditorHeader({
  telegramWidgetRef,
  ...props
}: EditorHeaderProps) {
  const selectedItem = props.compositions.find(
    (item) => item.compositionId === props.selectedComposition?.compositionId
  )

  return (
    <header className="editor-header glass corner-brackets">
      <div className="editor-header__brand">
        <span className="editor-header__kicker">workspace / editor</span>
        <div className="editor-header__heading">
          <h1 className="editor-header__title">composition editor</h1>
          <p className="editor-header__meta">
            {props.itemCount
              ? `${String(props.itemCount).padStart(2, "0")} images`
              : "no images"}
          </p>
        </div>
      </div>
      <div className="editor-header__content">
        <section
          className="editor-header__group editor-header__source"
          aria-label="Composition source"
        >
          {props.compositions.length ? (
            <Select
              value={props.selectedComposition?.compositionId ?? ""}
              disabled={!props.authSession}
              onValueChange={(value) => {
                const composition = props.compositions.find(
                  (item) => item.compositionId === value
                )
                if (composition) props.onSelectComposition(composition)
              }}
            >
              <SelectTrigger className="editor-header__select">
                <SelectValue placeholder="select build">
                  {props.selectedComposition
                    ? formatCompositionTitle(selectedItem ?? null)
                    : "Select build"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="editor-header__select-content">
                {props.compositions.map((composition, index) => (
                  <SelectItem
                    key={composition.compositionId}
                    value={composition.compositionId}
                  >
                    {String(index + 1).padStart(2, "0")} ·{" "}
                    {composition.imageCount} images ·{" "}
                    {formatCompositionMeta(composition)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <div className="editor-header__load">
            <Input
              className="editor-header__input"
              placeholder="paste bot link or code"
              type="text"
              value={props.loadCode}
              onChange={(event) => props.onLoadCodeChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") props.onLoad()
              }}
            />
            <Button
              className="editor-header__control"
              disabled={!props.authSession}
              size="sm"
              variant="secondary"
              onClick={props.onLoad}
            >
              load
            </Button>
          </div>
        </section>
        <section
          className="editor-header__group editor-header__account"
          aria-label="Account"
        >
          <Button
            className="editor-header__control"
            disabled={props.authLoading}
            size="sm"
            variant={props.authSession ? "ghost" : "default"}
            onClick={props.onLogin}
          >
            {props.authLoading
              ? "Loading..."
              : props.authSession
                ? "tg linked"
                : "tg login"}
          </Button>
          <span
            className={cn(
              "editor-header__auth-status",
              !props.authSession?.user.displayName &&
                "editor-header__auth-status--mono"
            )}
          >
            {props.authSession?.user.displayName ?? props.authStatus}
          </span>
          {props.telegramWidgetVisible ? (
            <div
              ref={telegramWidgetRef}
              className="editor-header__telegram-widget"
            />
          ) : null}
        </section>
        <section
          className="editor-header__group editor-header__outputs"
          aria-label="Composition actions"
        >
          <Button
            className="editor-header__control"
            disabled={!props.remoteComposition || !props.authSession}
            size="sm"
            onClick={props.onSave}
          >
            save edits
          </Button>
          {props.remoteComposition ? (
            <Button asChild size="sm" variant="secondary">
              <a href={props.createRoomUrl}>create room</a>
            </Button>
          ) : null}
          {props.remoteComposition ? (
            <Button
              disabled={!props.authSession}
              size="sm"
              variant="ghost"
              onClick={props.onDownload}
            >
              download
            </Button>
          ) : null}
        </section>
      </div>
    </header>
  )
}
