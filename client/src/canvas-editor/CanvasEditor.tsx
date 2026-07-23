import { useCallback, useState } from "react"

import { CanvasStage } from "./components/CanvasStage"
import { EditorAuthGate } from "./components/EditorAuthGate"
import { EditorHeader } from "./components/EditorHeader"
import { LayersPanel } from "./components/LayersPanel"
import { PropertiesPanel } from "./components/PropertiesPanel"
import { StatusBar } from "./components/StatusBar"
import { useCompositionSession } from "./hooks/use-composition-session"
import { useEditorDocument } from "./hooks/use-editor-document"
import { useEditorDrag } from "./hooks/use-editor-drag"
import { useEditorHoverLink } from "./hooks/use-editor-hover-link"
import { useEditorShortcuts } from "./hooks/use-editor-shortcuts"
import { useTelegramAuth } from "./hooks/use-telegram-auth"
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
    layout: editor.layout,
    layoutRef: editor.layoutRef,
    setLayout: editor.setLayout,
    viewportScale: editor.viewportScale,
    selectedIdSet: editor.selectedIdSet,
    selectedItems: editor.selectedItems,
    selectItem: editor.selectItem,
    selectOnlyItem: editor.selectOnlyItem,
    focusItem: editor.focusItem,
    clearSelection: editor.clearSelection,
    commitDrag: editor.commitDrag,
    setStatus: updateStatus,
  })

  useEditorShortcuts({
    selectedIds: editor.selectedIds,
    save: () => session.save(editor.layout),
    undo: editor.undo,
    redo: editor.redo,
    clearSelection: editor.clearSelection,
    recordLayoutChange: editor.recordLayoutChange,
    setStatus: updateStatus,
  })

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
    <main className="jigsaw-editor">
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
        onSave={() => void session.save(editor.layout)}
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
          canvasMaxSide={editor.canvasMaxSide}
          selectedIds={editor.selectedIds}
          selectedIndex={editor.selectedIndex}
          selectedItem={editor.selectedItem}
          showCanvasMarkers={editor.showCanvasMarkers}
          zoom={editor.zoom}
          onAspectRatio={editor.applyAspectRatioPreset}
          onCanvasScaleChange={editor.updateCanvasScale}
          onCanvasSizeChange={editor.updateCanvasSize}
          onMarkersChange={editor.setShowCanvasMarkers}
          onRestoreOriginal={editor.restoreOriginalCanvas}
          onSelectedItemChange={editor.updateSelectedItem}
          onZoomChange={editor.setZoom}
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
