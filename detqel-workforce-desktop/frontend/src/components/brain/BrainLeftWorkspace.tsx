"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { LayoutGrid } from "lucide-react";
import {
  BRAIN_GRID_GAP_PX,
  BRAIN_LAYOUT_STORAGE_KEY,
  BRAIN_MIN_WIDGET_PIXEL_WIDTH,
  BRAIN_WIDGET_DEFINITIONS,
  clampWidgetLayout,
  DEFAULT_BRAIN_LAYOUT,
  sanitizeBrainLayout,
  type BrainCapabilityItem,
  type BrainOverviewView,
  type BrainTelemetrySegment,
  type BrainTimeframeId,
  type BrainWidgetId,
  type BrainWidgetLayout,
} from "@/constants/brainConstants";
import { PrimaryButton } from "@/components/ui/primary-button";
import { SecondaryButton } from "@/components/ui/secondary-button";
import { BrainToolbar } from "./BrainToolbar";
import { CapabilitiesSection } from "./CapabilitiesSection";
import { EditableWidgetFrame, type ResizeDirection } from "./EditableWidgetFrame";
import { IntelligenceGlanceSection } from "./IntelligenceGlanceSection";
import type { BrainPanel } from "./panels/BrainPanelHost";
import {
  DataOntologyHealthCard,
  GovernedForecastCard,
  WhatIfSimulationCard,
  WorkforceApprovalsCard,
} from "./IntelligenceWidgets";

interface BrainLeftWorkspaceProps {
  timeframe: BrainTimeframeId;
  overview: BrainOverviewView;
  activeCapabilityId: string | null;
  isSplitDragging: boolean;
  onTimeframeChange: (timeframe: BrainTimeframeId) => void;
  onSelectTelemetry: (segment: BrainTelemetrySegment) => void;
  onSelectCapability: (capability: BrainCapabilityItem) => void;
  onExploreAll: () => void;
  onOpenPanel: (panel: BrainPanel) => void;
}

const MAGNETIC_PCT_STOPS = [33.333, 50, 66.667, 100];
const MAGNETIC_SNAP_THRESHOLD_PX = 6;

function readStoredLayout(): BrainWidgetLayout[] | null {
  try {
    const raw = localStorage.getItem(BRAIN_LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    return sanitizeBrainLayout(JSON.parse(raw));
  } catch {
    return null;
  }
}

function saveStoredLayout(layout: BrainWidgetLayout[] | null): void {
  try {
    if (!layout) {
      localStorage.removeItem(BRAIN_LAYOUT_STORAGE_KEY);
    } else {
      localStorage.setItem(BRAIN_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    }
  } catch {
    // Ignore restricted storage errors
  }
}

function cursorForDirection(direction: ResizeDirection): string {
  if (direction === "n" || direction === "s") return "ns-resize";
  if (direction === "e" || direction === "w") return "ew-resize";
  if (direction === "nw" || direction === "se") return "nwse-resize";
  return "nesw-resize";
}

export const BrainLeftWorkspace: React.FC<BrainLeftWorkspaceProps> = ({
  timeframe,
  overview,
  activeCapabilityId,
  isSplitDragging,
  onTimeframeChange,
  onSelectTelemetry,
  onSelectCapability,
  onExploreAll,
  onOpenPanel,
}) => {
  const [isEditingLayout, setIsEditingLayout] = useState(false);
  const [layout, setLayout] = useState<BrainWidgetLayout[]>(DEFAULT_BRAIN_LAYOUT);
  const layoutRef = useRef<BrainWidgetLayout[]>(layout);
  const [gridInnerWidth, setGridInnerWidth] = useState(0);

  const gridRef = useRef<HTMLDivElement>(null);
  const [resizingId, setResizingId] = useState<BrainWidgetId | null>(null);
  const [liveSize, setLiveSize] = useState<{ widthPx: number; heightPx: number } | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const resizeStateRef = useRef<{
    widgetId: BrainWidgetId;
    direction: ResizeDirection;
    startX: number;
    startY: number;
    startWidthPx: number;
    startHeightPx: number;
    gridWidth: number;
  } | null>(null);

  const [draggingCardId, setDraggingCardId] = useState<BrainWidgetId | null>(null);
  const [dropTargetId, setDropTargetId] = useState<BrainWidgetId | null>(null);
  const reorderStateRef = useRef<{ draggingId: BrainWidgetId } | null>(null);
  const dropTargetRef = useRef<BrainWidgetId | null>(null);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    const saved = readStoredLayout();
    if (saved) {
      Promise.resolve().then(() => {
        layoutRef.current = saved;
        setLayout(saved);
      });
    }
  }, []);

  useEffect(() => {
    const element = gridRef.current;
    if (!element) return;

    const measure = () => {
      setGridInnerWidth(element.clientWidth);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const commitLayout = useCallback(
    (updater: (prev: BrainWidgetLayout[]) => BrainWidgetLayout[], persist = true) => {
      setLayout((prev) => {
        const next = updater(prev);
        layoutRef.current = next;
        if (persist) saveStoredLayout(next);
        return next;
      });
    },
    [],
  );

  const handleResetLayout = useCallback(() => {
    setLayout(DEFAULT_BRAIN_LAYOUT);
    saveStoredLayout(null);
  }, []);

  const handleResetWidgetSize = useCallback(
    (widgetId: BrainWidgetId) => {
      const defaults = DEFAULT_BRAIN_LAYOUT.find((item) => item.id === widgetId);
      if (!defaults) return;
      commitLayout((prev) =>
        prev.map((item) =>
          item.id === widgetId
            ? { ...item, widthPct: defaults.widthPct, heightPx: defaults.heightPx }
            : item,
        ),
      );
    },
    [commitLayout],
  );

  const handleToggleWidgetVisibility = useCallback(
    (widgetId: BrainWidgetId) => {
      commitLayout((prev) =>
        prev.map((item) =>
          item.id === widgetId ? { ...item, visible: !item.visible } : item,
        ),
      );
    },
    [commitLayout],
  );

  const handleRemoveWidget = useCallback(
    (widgetId: BrainWidgetId) => {
      commitLayout((prev) =>
        prev.map((item) =>
          item.id === widgetId ? { ...item, visible: false } : item,
        ),
      );
    },
    [commitLayout],
  );

  const handleMoveStep = useCallback(
    (widgetId: BrainWidgetId, direction: "up" | "down") => {
      commitLayout((prev) => {
        const visibleIds = prev.filter((item) => item.visible).map((item) => item.id);
        const currentVisibleIdx = visibleIds.indexOf(widgetId);
        if (currentVisibleIdx < 0) return prev;
        const swapVisibleIdx =
          direction === "up" ? currentVisibleIdx - 1 : currentVisibleIdx + 1;
        if (swapVisibleIdx < 0 || swapVisibleIdx >= visibleIds.length) return prev;

        const targetId = visibleIds[swapVisibleIdx];
        const next = [...prev];
        const fromIdx = next.findIndex((item) => item.id === widgetId);
        const toIdx = next.findIndex((item) => item.id === targetId);
        if (fromIdx < 0 || toIdx < 0) return prev;
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);
        return next;
      });
    },
    [commitLayout],
  );

  const handleStartResize = useCallback(
    (
      event: React.PointerEvent<HTMLDivElement>,
      widget: BrainWidgetLayout,
      direction: ResizeDirection,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      const cardElement = event.currentTarget.closest<HTMLElement>("[data-brain-widget-id]");
      const cardRect = cardElement?.getBoundingClientRect();
      const gridWidth = gridRef.current?.clientWidth || 720;
      const startWidthPx = cardRect?.width ?? (widget.widthPct / 100) * gridWidth;
      const startHeightPx = cardRect?.height ?? BRAIN_WIDGET_DEFINITIONS[widget.id].minHeightPx;

      resizeStateRef.current = {
        widgetId: widget.id,
        direction,
        startX: event.clientX,
        startY: event.clientY,
        startWidthPx,
        startHeightPx,
        gridWidth,
      };
      setResizingId(widget.id);
      setLiveSize({ widthPx: startWidthPx, heightPx: startHeightPx });
      document.body.style.cursor = cursorForDirection(direction);
      document.body.style.userSelect = "none";
    },
    [],
  );

  useEffect(() => {
    if (!resizingId) return;

    const applyResize = (clientX: number, clientY: number, altKey: boolean) => {
      const state = resizeStateRef.current;
      if (!state) return;
      const def = BRAIN_WIDGET_DEFINITIONS[state.widgetId];
      const dx = clientX - state.startX;
      const dy = clientY - state.startY;
      const effectiveSpanDenominator = state.gridWidth + BRAIN_GRID_GAP_PX;

      let nextWidthPx = state.startWidthPx;
      if (state.direction.includes("e")) {
        nextWidthPx = state.startWidthPx + dx;
      } else if (state.direction.includes("w")) {
        nextWidthPx = state.startWidthPx - dx;
      }

      const minPixelWidth = Math.max(
        BRAIN_MIN_WIDGET_PIXEL_WIDTH,
        (def.minWidthPct / 100) * effectiveSpanDenominator - BRAIN_GRID_GAP_PX,
      );
      const clampedWidthPx = Math.min(state.gridWidth, Math.max(minPixelWidth, nextWidthPx));
      let nextWidthPct =
        ((clampedWidthPx + BRAIN_GRID_GAP_PX) / effectiveSpanDenominator) * 100;

      // Subtle magnetic assist only within 6px of common layout fractions (Alt bypasses)
      if (!altKey && (state.direction.includes("e") || state.direction.includes("w"))) {
        for (const stop of MAGNETIC_PCT_STOPS) {
          const stopPx = (stop / 100) * effectiveSpanDenominator - BRAIN_GRID_GAP_PX;
          if (Math.abs(clampedWidthPx - stopPx) <= MAGNETIC_SNAP_THRESHOLD_PX) {
            nextWidthPct = stop;
            break;
          }
        }
      }

      let nextHeightPx: number | null = state.startHeightPx;
      const hasVertical = state.direction.includes("s") || state.direction.includes("n");
      if (hasVertical) {
        const rawHeight = state.direction.includes("s")
          ? state.startHeightPx + dy
          : state.startHeightPx - dy;
        nextHeightPx = Math.min(def.maxHeightPx, Math.max(def.minHeightPx, rawHeight));
      }

      setLiveSize({
        widthPx: (nextWidthPct / 100) * effectiveSpanDenominator - BRAIN_GRID_GAP_PX,
        heightPx: nextHeightPx,
      });

      commitLayout(
        (prev) =>
          prev.map((item) => {
            if (item.id !== state.widgetId) return item;
            return clampWidgetLayout({
              ...item,
              widthPct:
                state.direction.includes("e") || state.direction.includes("w")
                  ? nextWidthPct
                  : item.widthPct,
              heightPx: hasVertical ? nextHeightPx : item.heightPx,
            });
          }),
        false,
      );
    };

    const handlePointerMove = (event: PointerEvent) => {
      const { clientX, clientY, altKey } = event;
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
      }
      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        applyResize(clientX, clientY, altKey);
      });
    };

    const stopResize = () => {
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      saveStoredLayout(layoutRef.current);
      resizeStateRef.current = null;
      setResizingId(null);
      setLiveSize(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
    return () => {
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [resizingId, commitLayout]);

  const handleStartReorder = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, widgetId: BrainWidgetId) => {
      event.preventDefault();
      event.stopPropagation();
      reorderStateRef.current = { draggingId: widgetId };
      dropTargetRef.current = null;
      setDraggingCardId(widgetId);
      setDropTargetId(null);
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    },
    [],
  );

  useEffect(() => {
    if (!draggingCardId) return;

    const handlePointerMove = (event: PointerEvent) => {
      const state = reorderStateRef.current;
      if (!state) return;
      const element = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-brain-widget-id]");
      const candidateId = element?.dataset.brainWidgetId as BrainWidgetId | undefined;
      const nextTarget =
        candidateId && candidateId !== state.draggingId ? candidateId : null;
      if (dropTargetRef.current !== nextTarget) {
        dropTargetRef.current = nextTarget;
        setDropTargetId(nextTarget);
      }
    };

    const stopReorder = () => {
      const state = reorderStateRef.current;
      const targetId = dropTargetRef.current;
      if (state && targetId && targetId !== state.draggingId) {
        commitLayout((prev) => {
          const next = [...prev];
          const fromIdx = next.findIndex((item) => item.id === state.draggingId);
          const toIdx = next.findIndex((item) => item.id === targetId);
          if (fromIdx < 0 || toIdx < 0) return prev;
          const [moved] = next.splice(fromIdx, 1);
          next.splice(toIdx, 0, moved);
          return next;
        });
      }
      reorderStateRef.current = null;
      dropTargetRef.current = null;
      setDraggingCardId(null);
      setDropTargetId(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopReorder);
    window.addEventListener("pointercancel", stopReorder);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopReorder);
      window.removeEventListener("pointercancel", stopReorder);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [draggingCardId, commitLayout]);

  const visibleWidgets = layout.filter((item) => item.visible);
  const isMultiColumn = gridInnerWidth === 0 || gridInnerWidth >= 560;

  const renderWidgetContent = (widgetId: BrainWidgetId) => {
    switch (widgetId) {
      case "telemetry":
        return (
          <IntelligenceGlanceSection
            segments={overview.telemetry}
            onSelectTelemetry={onSelectTelemetry}
          />
        );
      case "toolbox":
        return (
          <CapabilitiesSection
            activeCapabilityId={activeCapabilityId}
            onSelectCapability={onSelectCapability}
            onExploreAll={onExploreAll}
          />
        );
      case "forecast":
        return <GovernedForecastCard forecast={overview.forecast} onOpenPanel={onOpenPanel} />;
      case "simulation":
        return <WhatIfSimulationCard presets={overview.simulations} onOpenPanel={onOpenPanel} />;
      case "health":
        return <DataOntologyHealthCard health={overview.health} onOpenPanel={onOpenPanel} />;
      case "approvals":
        return <WorkforceApprovalsCard approvals={overview.approvals} onOpenPanel={onOpenPanel} />;
    }
  };

  return (
    <section
      aria-label="Business Brain workspace"
      className={`@container w-full lg:w-[var(--brain-left-width)] lg:min-w-[var(--brain-min-width)] shrink-0 bg-white dark:bg-[#182234] border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-xs lg:h-full flex flex-col overflow-hidden ${
        isSplitDragging ? "transition-none" : "transition-colors"
      }`}
    >
      <BrainToolbar
        timeframe={timeframe}
        isEditingLayout={isEditingLayout}
        layout={layout}
        onTimeframeChange={onTimeframeChange}
        onToggleEditLayout={() => setIsEditingLayout((prev) => !prev)}
        onResetLayout={handleResetLayout}
        onToggleWidgetVisibility={handleToggleWidgetVisibility}
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-5">
        {visibleWidgets.length === 0 ? (
          <div className="h-full min-h-[260px] rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-[#131c2d] flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-primary-muted text-primary border border-primary-border flex items-center justify-center">
              <LayoutGrid className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                No sections displayed
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
                Use Edit Layout above to toggle sections back on, or restore the default workspace.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!isEditingLayout && (
                <SecondaryButton
                  onClick={() => setIsEditingLayout(true)}
                  value="Edit Layout"
                />
              )}
              <PrimaryButton onClick={handleResetLayout} value="Restore Default" />
            </div>
          </div>
        ) : (
          <div
            ref={gridRef}
            style={{ gap: `${BRAIN_GRID_GAP_PX}px` }}
            className="flex flex-wrap items-stretch content-start"
          >
            {visibleWidgets.map((widget, index) => (
              <EditableWidgetFrame
                key={widget.id}
                widget={widget}
                index={index}
                totalVisible={visibleWidgets.length}
                isEditing={isEditingLayout}
                isMultiColumn={isMultiColumn}
                isResizing={resizingId === widget.id}
                isDraggingCard={draggingCardId === widget.id}
                isDropTarget={dropTargetId === widget.id}
                liveWidthPx={resizingId === widget.id ? liveSize?.widthPx : null}
                liveHeightPx={resizingId === widget.id ? liveSize?.heightPx : null}
                onStartResize={handleStartResize}
                onResetSize={handleResetWidgetSize}
                onStartReorder={handleStartReorder}
                onMoveStep={handleMoveStep}
                onRemove={handleRemoveWidget}
              >
                {renderWidgetContent(widget.id)}
              </EditableWidgetFrame>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
