"use client";

import React from "react";
import { ChevronDown, ChevronUp, GripVertical, Lock, X } from "lucide-react";
import {
  BRAIN_GRID_GAP_PX,
  BRAIN_WIDGET_DEFINITIONS,
  type BrainWidgetId,
  type BrainWidgetLayout,
} from "@/constants/brainConstants";

export type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface EditableWidgetFrameProps {
  widget: BrainWidgetLayout;
  index: number;
  totalVisible: number;
  isEditing: boolean;
  isMultiColumn: boolean;
  isResizing: boolean;
  isDraggingCard: boolean;
  isDropTarget: boolean;
  liveWidthPx?: number | null;
  liveHeightPx?: number | null;
  onStartResize: (
    event: React.PointerEvent<HTMLDivElement>,
    widget: BrainWidgetLayout,
    direction: ResizeDirection,
  ) => void;
  onResetSize: (widgetId: BrainWidgetId) => void;
  onStartReorder: (
    event: React.PointerEvent<HTMLDivElement>,
    widgetId: BrainWidgetId,
  ) => void;
  onMoveStep: (widgetId: BrainWidgetId, direction: "up" | "down") => void;
  onRemove: (widgetId: BrainWidgetId) => void;
  children: React.ReactNode;
}

export const EditableWidgetFrame: React.FC<EditableWidgetFrameProps> = ({
  widget,
  index,
  totalVisible,
  isEditing,
  isMultiColumn,
  isResizing,
  isDraggingCard,
  isDropTarget,
  liveWidthPx,
  liveHeightPx,
  onStartResize,
  onResetSize,
  onStartReorder,
  onMoveStep,
  onRemove,
  children,
}) => {
  const def = BRAIN_WIDGET_DEFINITIONS[widget.id];
  const pct = isMultiColumn ? widget.widthPct : 100;
  const gapOffset = BRAIN_GRID_GAP_PX * (1 - pct / 100);
  const widthExpression =
    pct >= 99.9 ? "100%" : `calc(${pct.toFixed(3)}% - ${gapOffset.toFixed(2)}px)`;

  const sizeLabel =
    isResizing && liveWidthPx && liveHeightPx
      ? `${Math.round(pct)}% · ${Math.round(liveWidthPx)}×${Math.round(liveHeightPx)}`
      : `${Math.round(pct)}%`;

  return (
    <div
      data-brain-widget-id={widget.id}
      style={{
        width: widthExpression,
        flexBasis: widthExpression,
        minHeight: widget.heightPx !== null ? `${widget.heightPx}px` : undefined,
      }}
      className={`@container relative rounded-xl flex flex-col shrink-0 grow-0 min-w-0 ${
        isResizing ? "transition-none select-none" : "transition-[border-color,box-shadow,opacity] duration-150"
      } ${
        isEditing
          ? isDropTarget
            ? "border-2 border-primary bg-primary-muted/25 ring-2 ring-primary-ring shadow-md"
            : isDraggingCard
              ? "border-2 border-dashed border-primary bg-white/80 dark:bg-[#182234]/80 opacity-55 shadow-xs"
              : isResizing
                ? "border-2 border-primary bg-white dark:bg-[#182234] ring-2 ring-primary-ring shadow-md z-10"
                : "border-2 border-primary/50 hover:border-primary/80 bg-white dark:bg-[#182234] shadow-xs"
          : "border border-slate-200/85 dark:border-slate-800 bg-slate-50/45 dark:bg-[#131c2d]"
      }`}
    >
      {/* Edit Layout perimeter handles (edge pills + corner handles) */}
      {isEditing && (
        <>
          {/* North & South smooth height handles */}
          <div
            role="presentation"
            title="Drag to resize height · Double-click to reset size"
            onPointerDown={(event) => onStartResize(event, widget, "n")}
            onDoubleClick={() => onResetSize(widget.id)}
            className="absolute -top-1.5 left-6 right-6 h-3 flex items-center justify-center cursor-ns-resize z-20 touch-none group"
          >
            <span className="w-9 h-1 rounded-full bg-primary/70 group-hover:w-12 group-hover:h-1.5 group-hover:bg-primary transition-all" />
          </div>
          <div
            role="presentation"
            title="Drag to resize height · Double-click to reset size"
            onPointerDown={(event) => onStartResize(event, widget, "s")}
            onDoubleClick={() => onResetSize(widget.id)}
            className="absolute -bottom-1.5 left-6 right-6 h-3 flex items-center justify-center cursor-ns-resize z-20 touch-none group"
          >
            <span className="w-9 h-1 rounded-full bg-primary/70 group-hover:w-12 group-hover:h-1.5 group-hover:bg-primary transition-all" />
          </div>

          {/* West & East smooth width handles */}
          {isMultiColumn && (
            <>
              <div
                role="presentation"
                title="Drag to resize width · Double-click to reset size"
                onPointerDown={(event) => onStartResize(event, widget, "w")}
                onDoubleClick={() => onResetSize(widget.id)}
                className="absolute -left-1.5 top-6 bottom-6 w-3 flex items-center justify-center cursor-ew-resize z-20 touch-none group"
              >
                <span className="w-1 h-9 rounded-full bg-primary/70 group-hover:w-1.5 group-hover:h-12 group-hover:bg-primary transition-all" />
              </div>
              <div
                role="presentation"
                title="Drag to resize width · Double-click to reset size"
                onPointerDown={(event) => onStartResize(event, widget, "e")}
                onDoubleClick={() => onResetSize(widget.id)}
                className="absolute -right-1.5 top-6 bottom-6 w-3 flex items-center justify-center cursor-ew-resize z-20 touch-none group"
              >
                <span className="w-1 h-9 rounded-full bg-primary/70 group-hover:w-1.5 group-hover:h-12 group-hover:bg-primary transition-all" />
              </div>
            </>
          )}

          {/* 4 Corner handles for simultaneous diagonal resize */}
          <div
            role="presentation"
            title="Drag corner to resize · Double-click to reset size"
            onPointerDown={(event) => onStartResize(event, widget, isMultiColumn ? "nw" : "n")}
            onDoubleClick={() => onResetSize(widget.id)}
            className={`absolute -top-1.5 -left-1.5 w-3.5 h-3.5 flex items-center justify-center z-30 touch-none group ${
              isMultiColumn ? "cursor-nwse-resize" : "cursor-ns-resize"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-xs bg-primary border border-white dark:border-slate-900 shadow-xs group-hover:scale-125 transition-transform" />
          </div>
          <div
            role="presentation"
            title="Drag corner to resize · Double-click to reset size"
            onPointerDown={(event) => onStartResize(event, widget, isMultiColumn ? "ne" : "n")}
            onDoubleClick={() => onResetSize(widget.id)}
            className={`absolute -top-1.5 -right-1.5 w-3.5 h-3.5 flex items-center justify-center z-30 touch-none group ${
              isMultiColumn ? "cursor-nesw-resize" : "cursor-ns-resize"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-xs bg-primary border border-white dark:border-slate-900 shadow-xs group-hover:scale-125 transition-transform" />
          </div>
          <div
            role="presentation"
            title="Drag corner to resize · Double-click to reset size"
            onPointerDown={(event) => onStartResize(event, widget, isMultiColumn ? "sw" : "s")}
            onDoubleClick={() => onResetSize(widget.id)}
            className={`absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 flex items-center justify-center z-30 touch-none group ${
              isMultiColumn ? "cursor-nesw-resize" : "cursor-ns-resize"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-xs bg-primary border border-white dark:border-slate-900 shadow-xs group-hover:scale-125 transition-transform" />
          </div>
          <div
            role="presentation"
            title="Drag corner to resize · Double-click to reset size"
            onPointerDown={(event) => onStartResize(event, widget, isMultiColumn ? "se" : "s")}
            onDoubleClick={() => onResetSize(widget.id)}
            className={`absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 flex items-center justify-center z-30 touch-none group ${
              isMultiColumn ? "cursor-nwse-resize" : "cursor-ns-resize"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-xs bg-primary border border-white dark:border-slate-900 shadow-xs group-hover:scale-125 transition-transform" />
          </div>

          {/* Sleek Compact Edit Header Strip */}
          <div className="px-2.5 py-1.5 border-b border-primary/15 bg-primary-muted/50 rounded-t-[10px] flex items-center justify-between gap-2 shrink-0">
            <div
              onPointerDown={(event) => onStartReorder(event, widget.id)}
              title="Drag to place section"
              className="flex items-center gap-1.5 min-w-0 flex-1 cursor-grab active:cursor-grabbing touch-none"
            >
              <GripVertical className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden="true" />
              <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100 truncate">
                {isDropTarget ? `Drop to place here` : def.label}
              </span>
              {def.lockedItems && (
                <span
                  title="Toolbox items cannot be edited; only the main container can be resized and moved."
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/90 dark:bg-[#131c2d] border border-slate-200/80 dark:border-slate-700 text-[9px] font-semibold text-slate-600 dark:text-slate-300 shrink-0"
                >
                  <Lock className="w-2.5 h-2.5 text-primary" aria-hidden="true" />
                  <span className="hidden @sm:inline">Items locked</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums mr-0.5 ${
                  isResizing
                    ? "bg-primary text-primary-fg shadow-2xs"
                    : "bg-white/90 dark:bg-[#131c2d] border border-primary-border text-primary"
                }`}
              >
                {sizeLabel}
              </span>

              <button
                type="button"
                disabled={index === 0}
                onClick={() => onMoveStep(widget.id, "up")}
                aria-label={`Move ${def.label} earlier`}
                title="Move earlier"
                className="w-6 h-6 rounded-md flex items-center justify-center text-slate-500 hover:text-primary hover:bg-white/80 dark:hover:bg-[#131c2d] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={index === totalVisible - 1}
                onClick={() => onMoveStep(widget.id, "down")}
                aria-label={`Move ${def.label} later`}
                title="Move later"
                className="w-6 h-6 rounded-md flex items-center justify-center text-slate-500 hover:text-primary hover:bg-white/80 dark:hover:bg-[#131c2d] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              {def.removable && !def.lockedItems && (
                <button
                  type="button"
                  onClick={() => onRemove(widget.id)}
                  aria-label={`Remove ${def.label}`}
                  title="Remove section"
                  className="w-6 h-6 rounded-md flex items-center justify-center text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-white/80 dark:hover:bg-[#131c2d] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Widget Content */}
      <div
        className={`flex-1 flex flex-col min-h-0 overflow-hidden rounded-xl ${
          isEditing ? "pointer-events-none select-none opacity-95" : ""
        }`}
      >
        {children}
      </div>
    </div>
  );
};
