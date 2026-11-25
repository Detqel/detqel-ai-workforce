"use client";

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  formatAssistantTimestamp,
  type BrainAssistantMessage,
  type BrainCapabilityItem,
  type BrainTelemetrySegment,
  type BrainTimeframeId,
} from "@/constants/brainConstants";
import {
  BrainAssistantPanel,
  BrainLeftWorkspace,
  CapabilityExplorerModal,
} from "@/components/brain";
import { useBrainOverview } from "@/hooks/useBrainOverview";
import { brainApi } from "@/lib/api/brain";
import { toAssistantMessage } from "@/lib/brain-view";

const SPLIT_GUTTER_WIDTH_PX = 12;
const PREFERRED_MIN_PANE_WIDTH_PX = 400;
const ABSOLUTE_MIN_PANE_WIDTH_PX = 300;
const KEYBOARD_RESIZE_STEP_PX = 24;
const KEYBOARD_RESIZE_LARGE_STEP_PX = 64;
const SPLIT_RATIO_STORAGE_KEY = "detqel_brain_split_left_ratio";

const subscribeMount = () => () => {};
const clientMounted = () => true;
const serverMounted = () => false;

function getUserInitials(name?: string | null): string {
  const trimmed = name?.trim();
  if (!trimmed) return "RK";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const assistantNotice = (id: string, content: string): BrainAssistantMessage => ({
  id,
  role: "assistant",
  content,
  timestamp: formatAssistantTimestamp(),
});

function readStoredRatio(): number | null {
  try {
    const raw = localStorage.getItem(SPLIT_RATIO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 && parsed < 1 ? parsed : null;
  } catch {
    return null;
  }
}

function saveStoredRatio(ratio: number | null): void {
  try {
    if (ratio === null) {
      localStorage.removeItem(SPLIT_RATIO_STORAGE_KEY);
    } else {
      localStorage.setItem(SPLIT_RATIO_STORAGE_KEY, ratio.toFixed(4));
    }
  } catch {
    // Ignore restricted storage errors
  }
}

function computeSplitBounds(usableWidth: number): {
  minPaneWidth: number;
  maxLeftWidth: number;
} {
  const minPaneWidth = Math.min(
    PREFERRED_MIN_PANE_WIDTH_PX,
    Math.max(ABSOLUTE_MIN_PANE_WIDTH_PX, Math.floor(usableWidth * 0.44)),
  );
  const maxLeftWidth = Math.max(minPaneWidth, usableWidth - minPaneWidth);
  return { minPaneWidth, maxLeftWidth };
}

export default function BusinessBrainPage() {
  const { user, currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? null;
  const isMounted = useSyncExternalStore(subscribeMount, clientMounted, serverMounted);
  const userInitials = isMounted ? getUserInitials(user?.name) : "RK";

  const [timeframe, setTimeframe] = useState<BrainTimeframeId>("30d");
  const { view: overview, reload: reloadOverview } = useBrainOverview(workspaceId, timeframe);
  const [activeCapabilityId, setActiveCapabilityId] = useState<string | null>(null);
  const [isExplorerOpen, setIsExplorerOpen] = useState(false);
  const [messages, setMessages] = useState<BrainAssistantMessage[]>([]);
  const [isResponding, setIsResponding] = useState(false);

  const splitContainerRef = useRef<HTMLDivElement>(null);
  const [usableWidth, setUsableWidth] = useState<number>(0);
  const [leftRatio, setLeftRatio] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{ startX: number; startLeftWidth: number } | null>(null);

  const messageSeqRef = useRef(0);
  const conversationIdRef = useRef<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  // Conversations are private to one workspace; switching starts a new one and drops any answer still on its way.
  useEffect(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    conversationIdRef.current = null;
    Promise.resolve().then(() => {
      setMessages([]);
      setIsResponding(false);
    });
  }, [workspaceId]);

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    const saved = readStoredRatio();
    if (saved !== null) {
      Promise.resolve().then(() => setLeftRatio(saved));
    }
  }, []);

  useEffect(() => {
    const element = splitContainerRef.current;
    if (!element) return;

    const measure = () => {
      const style = window.getComputedStyle(element);
      if (style.flexDirection !== "row") {
        setUsableWidth(0);
        return;
      }
      const nextUsable = Math.max(0, Math.floor(element.clientWidth - SPLIT_GUTTER_WIDTH_PX));
      setUsableWidth(nextUsable);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const hasMeasuredSplit = usableWidth > 0;
  const { minPaneWidth, maxLeftWidth } = hasMeasuredSplit
    ? computeSplitBounds(usableWidth)
    : { minPaneWidth: PREFERRED_MIN_PANE_WIDTH_PX, maxLeftWidth: PREFERRED_MIN_PANE_WIDTH_PX };

  const rawLeftWidth =
    hasMeasuredSplit && leftRatio !== null
      ? Math.round(leftRatio * usableWidth)
      : maxLeftWidth;
  const leftWidthPx = hasMeasuredSplit
    ? Math.min(maxLeftWidth, Math.max(minPaneWidth, rawLeftWidth))
    : null;
  const rightWidthPx =
    hasMeasuredSplit && leftWidthPx !== null ? usableWidth - leftWidthPx : null;

  const updateLeftWidth = useCallback(
    (nextLeftPx: number) => {
      if (!hasMeasuredSplit || usableWidth <= 0) return;
      const { minPaneWidth: minW, maxLeftWidth: maxW } = computeSplitBounds(usableWidth);
      const clamped = Math.min(maxW, Math.max(minW, Math.round(nextLeftPx)));
      const nextRatio = clamped / usableWidth;
      setLeftRatio(nextRatio);
      saveStoredRatio(nextRatio);
    },
    [hasMeasuredSplit, usableWidth],
  );

  const resetSplit = useCallback(() => {
    setLeftRatio(null);
    saveStoredRatio(null);
  }, []);

  const handleDividerPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!hasMeasuredSplit || leftWidthPx === null) return;
    event.preventDefault();
    dragStateRef.current = {
      startX: event.clientX,
      startLeftWidth: leftWidthPx,
    };
    setIsDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      const deltaX = event.clientX - drag.startX;
      updateLeftWidth(drag.startLeftWidth + deltaX);
    };

    const stopDragging = () => {
      dragStateRef.current = null;
      setIsDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging, updateLeftWidth]);

  const handleDividerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!hasMeasuredSplit || leftWidthPx === null) return;
    const step = event.shiftKey ? KEYBOARD_RESIZE_LARGE_STEP_PX : KEYBOARD_RESIZE_STEP_PX;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      updateLeftWidth(leftWidthPx - step);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      updateLeftWidth(leftWidthPx + step);
    } else if (event.key === "Home") {
      event.preventDefault();
      updateLeftWidth(minPaneWidth);
    } else if (event.key === "End") {
      event.preventDefault();
      updateLeftWidth(maxLeftWidth);
    } else if (event.key === "Enter") {
      event.preventDefault();
      resetSplit();
    }
  };

  const handleSendMessage = useCallback(
    (prompt: string, attachments?: string[]) => {
      const trimmed = prompt.trim();
      // One question at a time keeps the conversation in order.
      if (!trimmed || requestRef.current) return;

      const seq = ++messageSeqRef.current;
      const pendingId = `pending-${seq}`;
      setMessages((prev) => [
        ...prev,
        { id: pendingId, role: "user", content: trimmed, timestamp: formatAssistantTimestamp(), attachments },
      ]);
      if (!workspaceId) {
        setMessages((prev) => [...prev, assistantNotice(`notice-${seq}`, "Select a workspace to ask the Business Brain.")]);
        return;
      }

      const controller = new AbortController();
      requestRef.current = controller;
      setIsResponding(true);
      brainApi
        .ask(workspaceId, { conversationId: conversationIdRef.current ?? undefined, message: trimmed, attachments }, controller.signal)
        .then((result) => {
          conversationIdRef.current = result.conversation.id;
          // The stored question replaces the optimistic one, followed by the governed answer.
          setMessages((prev) => [...prev.filter((message) => message.id !== pendingId), ...result.messages.map(toAssistantMessage)]);
          reloadOverview();
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          const reason = error instanceof Error ? error.message : "The request failed.";
          setMessages((prev) => [...prev, assistantNotice(`error-${seq}`, `I couldn't answer that. ${reason}`)]);
        })
        .finally(() => {
          if (requestRef.current !== controller) return;
          requestRef.current = null;
          setIsResponding(false);
        });
    },
    [workspaceId, reloadOverview],
  );

  const handleSelectTelemetry = useCallback(
    (segment: BrainTelemetrySegment) => {
      handleSendMessage(segment.prompt);
    },
    [handleSendMessage],
  );

  const handleSelectCapability = useCallback(
    (capability: BrainCapabilityItem) => {
      setActiveCapabilityId(capability.id);
      handleSendMessage(capability.prompt);
    },
    [handleSendMessage],
  );

  const handleRunCapabilityPrompt = useCallback(
    (prompt: string, capability: BrainCapabilityItem) => {
      setActiveCapabilityId(capability.id);
      handleSendMessage(prompt);
    },
    [handleSendMessage],
  );

  const splitCssVars = (
    leftWidthPx !== null && rightWidthPx !== null
      ? {
          "--brain-left-width": `${leftWidthPx}px`,
          "--brain-right-width": `${rightWidthPx}px`,
          "--brain-min-width": `${minPaneWidth}px`,
        }
      : {
          "--brain-left-width": "calc(100% - 412px)",
          "--brain-right-width": "400px",
          "--brain-min-width": "380px",
        }
  ) as React.CSSProperties;

  const leftPercentage =
    hasMeasuredSplit && leftWidthPx !== null
      ? Math.round((leftWidthPx / usableWidth) * 100)
      : 69;

  return (
    <div className="min-h-full lg:h-full w-full p-4 sm:p-5 bg-slate-50/60 dark:bg-[#0e1422] text-slate-900 dark:text-slate-100 select-none lg:overflow-hidden transition-colors">
      {/* Variable split workspace with hover-only resize line */}
      <div
        ref={splitContainerRef}
        style={splitCssVars}
        className="w-full min-h-full lg:h-full flex flex-col lg:flex-row gap-4 lg:gap-0 items-stretch"
      >
        {/* Left Section: Customizable Editable Layout Workspace */}
        <BrainLeftWorkspace
          timeframe={timeframe}
          overview={overview}
          activeCapabilityId={activeCapabilityId}
          isSplitDragging={isDragging}
          onTimeframeChange={setTimeframe}
          onSelectTelemetry={handleSelectTelemetry}
          onSelectCapability={handleSelectCapability}
          onExploreAll={() => setIsExplorerOpen(true)}
          onSendPrompt={handleSendMessage}
        />

        {/* Hover-Only Vertical Resizer Gutter (Desktop lg+) */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize Business Intelligence and Assistant panels"
          aria-valuemin={hasMeasuredSplit ? Math.round((minPaneWidth / usableWidth) * 100) : 30}
          aria-valuemax={hasMeasuredSplit ? Math.round((maxLeftWidth / usableWidth) * 100) : 70}
          aria-valuenow={leftPercentage}
          tabIndex={0}
          title="Drag to resize panels · Double-click to reset"
          onPointerDown={handleDividerPointerDown}
          onDoubleClick={resetSplit}
          onKeyDown={handleDividerKeyDown}
          className="hidden lg:flex w-3 shrink-0 items-center justify-center cursor-col-resize group focus-visible:outline-none touch-none"
        >
          <div
            className={`h-full w-[2px] rounded-full transition-all duration-150 ${
              isDragging
                ? "bg-primary opacity-100"
                : "bg-transparent opacity-0 group-hover:bg-primary group-hover:opacity-100 group-focus-visible:bg-primary group-focus-visible:opacity-100"
            }`}
          />
        </div>

        {/* Right Section: Business Brain Assistant Chat */}
        <BrainAssistantPanel
          messages={messages}
          userInitials={userInitials}
          isResponding={isResponding}
          isDragging={isDragging}
          onSendMessage={handleSendMessage}
        />
      </div>

      {/* Capabilities Explorer Modal */}
      <CapabilityExplorerModal
        isOpen={isExplorerOpen}
        onClose={() => setIsExplorerOpen(false)}
        onRunPrompt={handleRunCapabilityPrompt}
      />
    </div>
  );
}
