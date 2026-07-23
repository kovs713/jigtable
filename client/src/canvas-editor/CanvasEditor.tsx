import { useCallback, useState } from "react"

import { CanvasStage } from "./components/CanvasStage"
import { EditorAuthGate } from "./components/EditorAuthGate"
import { EditorHeader } from "./components/EditorHeader"
import { LayersPanel } from "./components/LayersPanel"
import type { ContinuousNumberEdit } from "./components/NumberField"
import { PropertiesPanel } from "./components/PropertiesPanel"
import { StatusBar } from "./components/StatusBar"
import { useCompositionSession } from "./hooks/use-composition-session"
import { useEditorDocument } from "./hooks/use-editor-document"
import { useEditorDrag } from "./hooks/use-editor-drag"
import { useEditorHoverLink } from "./hooks/use-editor-hover-link"
import { useEditorShortcuts } from "./hooks/use-editor-shortcuts"
import { useTelegramAuth } from "./hooks/use-telegram-auth"
import type {
  EditorInteraction,
  EditorTransactionEdit,
} from "./model/editor-document"
import { getImageMarkerStyle } from "./model/markers"
import type { EditorStatus } from "./model/types"

import "./canvas-editor.css"

export function CanvasEditor() {
  const [status, setStatus] = useState<EditorStatus>({
    kind: "idle",
    message: "Open the link from the bot",
  })
  const updateStatus = useCallback(
    (message: string, kind: EditorStatus["kind"] = "success") =>
      setStatus({ kind, message }),
    []
  )
  const auth = useTelegramAuth()
  const editor = useEditorDocument(updateStatus)
  const session = useCompositionSession({
    authSession: auth.authSession,
    applyLayout: editor.applyLayout,
    setStatus: updateStatus,
  })
  const hover = useEditorHoverLink(editor.layout.items, editor.viewportScale)
  const drag = useEditorDrag({
    viewportScale: editor.viewportScale,
    selectedIdSet: editor.selectedIdSet,
    selectedItems: editor.selectedItems,
    selectItem: editor.selectItem,
    selectOnlyItem: editor.selectOnlyItem,
    focusItem: editor.focusItem,
    clearSelection: editor.clearSelection,
    beginTransaction: editor.beginTransaction,
    previewTransaction: editor.previewTransaction,
    finishTransaction: editor.finishTransaction,
    setStatus: updateStatus,
  })

  const save = () => {
    if (editor.transaction) {
      updateStatus("Finish or cancel the current edit before saving", "idle")
      return
    }
    return session.save(editor.layout)
  }

  useEditorShortcuts({
    selectedIds: editor.selectedIds,
    save,
    undo: editor.undo,
    redo: editor.redo,
    clearSelection: editor.clearSelection,
    nudgeSelection: editor.nudgeSelection,
    setStatus: updateStatus,
  })

  function numberEdit(
    interaction: EditorInteraction,
    toEdit: (value: number) => EditorTransactionEdit,
    message: string
  ): ContinuousNumberEdit {
    return {
      begin: () => editor.beginTransaction(interaction),
      preview: (token, value) => {
        editor.previewTransaction(token, toEdit(value))
      },
      finish: (token, disposition) => {
        const outcome = editor.finishTransaction(token, disposition)
        if (
          outcome.type === "transaction-finished" &&
          outcome.disposition === "commit" &&
          outcome.changed
        ) {
          updateStatus(message)
        } else if (
          outcome.type === "transaction-finished" &&
          outcome.disposition === "rollback"
        ) {
          updateStatus("Edit canceled", "idle")
        }
      },
    }
  }

  const canvasDimensionEdit = (field: "width" | "height") =>
    numberEdit(
      { type: "canvas-dimension", field },
      (value) => ({ type: "canvas-dimension", field, value }),
      "Canvas size updated"
    )
  const canvasScaleEdit = numberEdit(
    { type: "canvas-max-side" },
    (value) => ({ type: "canvas-max-side", value }),
    "Canvas size updated"
  )
  const selectedItemEdit = (field: "x" | "y" | "width" | "height") =>
    numberEdit(
      { type: "primary-field", field },
      (value) => ({ type: "primary-field", field, value }),
      "Image updated"
    )

  if (session.remoteComposition && !auth.authSession) {
    return (
      <EditorAuthGate
        authLoading={auth.authLoading}
        authStatus={auth.authStatus}
        telegramWidgetRef={auth.telegramWidgetRef}
        telegramWidgetVisible={auth.telegramWidgetVisible}
        onLogin={() => void auth.loginWithTelegram()}
      />
    )
  }

  const setLayerRowRef = (itemId: string) => {
    const setDocumentRef = editor.setLayerRowRef(itemId)
    const setHoverRef = hover.setLayerRowRef(itemId)
    return (node: HTMLDivElement | null) => {
      setDocumentRef(node)
      setHoverRef(node)
    }
  }

  return (
    <main
      className="jigsaw-editor"
      onPointerDownCapture={(event) => {
        const activeElement = document.activeElement
        if (
          activeElement instanceof HTMLElement &&
          event.target instanceof Node &&
          !activeElement.contains(event.target) &&
          activeElement.matches("input,textarea,select")
        ) {
          activeElement.blur()
        }
      }}
    >
      {hover.hoverLinkItemId && hover.hoverLinkLine ? (
        <svg
          aria-hidden="true"
          className="jigsaw-editor__link-line"
          style={getImageMarkerStyle(hover.hoverLinkLine.itemIndex)}
        >
          <path
            d={hover.hoverLinkLine.path}
            fill="none"
            stroke="var(--image-marker)"
            strokeDasharray="4 4"
            strokeLinecap="square"
            strokeOpacity="0.85"
            strokeWidth="1.25"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : null}
      <EditorHeader
        authLoading={auth.authLoading}
        authSession={auth.authSession}
        authStatus={auth.authStatus}
        compositions={session.compositions}
        createRoomUrl={session.getCreateRoomUrl(editor.layout)}
        itemCount={editor.layout.items.length}
        loadCode={session.loadCode}
        remoteComposition={session.remoteComposition}
        selectedComposition={session.selectedComposition}
        telegramWidgetRef={auth.telegramWidgetRef}
        telegramWidgetVisible={auth.telegramWidgetVisible}
        onDownload={() => void session.render(editor.layout)}
        onLoad={() => void session.loadFromCode()}
        onLoadCodeChange={session.setLoadCode}
        onLogin={() => void auth.loginWithTelegram()}
        onSave={() => void save()}
        onSelectComposition={session.selectComposition}
      />
      <div className="editor-workspace">
        <LayersPanel
          entries={editor.layerListEntries}
          hoverLinkItemId={hover.hoverLinkItemId}
          itemCount={editor.layout.items.length}
          selectedIdSet={editor.selectedIdSet}
          setHoveredItem={hover.setHoveredItem}
          setLayerActionRef={editor.setLayerActionRef}
          setLayerRowRef={setLayerRowRef}
          onFocus={editor.focusItem}
          onMoveLayer={editor.moveItemLayer}
          onMoveLayerTo={editor.moveItemLayerTo}
          onReorder={editor.reorderItemLayer}
          onSelect={editor.selectItem}
          onStatus={updateStatus}
        />
        <CanvasStage
          hoverLinkItemId={hover.hoverLinkItemId}
          layerIndexById={editor.layerIndexById}
          layout={editor.layout}
          selectedIdSet={editor.selectedIdSet}
          setCanvasItemRef={hover.setCanvasItemRef}
          setHoveredItem={hover.setHoveredItem}
          showCanvasMarkers={editor.showCanvasMarkers}
          viewportScale={editor.viewportScale}
          onClearSelection={editor.clearSelection}
          onStartCanvasResize={drag.startCanvasResize}
          onStartItemResize={drag.startItemResize}
          onStartMove={drag.startMove}
        />
        <PropertiesPanel
          activeRatio={editor.activeRatio}
          canvas={editor.layout.canvas}
          canvasDimensionEdit={canvasDimensionEdit}
          canvasMaxSide={editor.canvasMaxSide}
          canvasScaleEdit={canvasScaleEdit}
          selectedIds={editor.selectedIds}
          selectedIndex={editor.selectedIndex}
          selectedItem={editor.selectedItem}
          showCanvasMarkers={editor.showCanvasMarkers}
          zoom={editor.zoom}
          onAspectRatio={editor.applyAspectRatioPreset}
          onMarkersChange={editor.setShowCanvasMarkers}
          onRestoreOriginal={editor.restoreOriginalCanvas}
          onZoomChange={editor.setZoom}
          selectedItemEdit={selectedItemEdit}
        />
      </div>
      <StatusBar
        canvas={editor.layout.canvas}
        selectedItem={editor.selectedItem}
        status={status}
      />
    </main>
  )
}
