"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Plus,
  Trash2,
  Workflow as WorkflowIcon,
  MousePointer,
} from "lucide-react";
import type {
  WorkflowNode,
  WorkflowEdge,
  PaletteItemDefinition,
} from "@/types/workflow";
import { WorkflowNodeItem } from "./WorkflowNodeItem";
import { currentDraggedItem } from "./WorkflowPalette";

interface WorkflowCanvasProps {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onUpdateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  onDeleteNode: (nodeId: string) => void;
  onAddEdge: (edge: Omit<WorkflowEdge, "id">) => void;
  onDeleteEdge: (edgeId: string) => void;
  onDropPaletteItem: (item: PaletteItemDefinition, position: { x: number; y: number }) => void;
  onAddInitialTrigger: () => void;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  pan: { x: number; y: number };
  setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
}

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  onUpdateNodePosition,
  onDeleteNode,
  onAddEdge,
  onDeleteEdge,
  onDropPaletteItem,
  onAddInitialTrigger,
  zoom,
  setZoom,
  pan,
  setPan,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Panning state
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Node dragging state
  const [draggingNode, setDraggingNode] = useState<{
    nodeId: string;
    startX: number;
    startY: number;
    initialNodeX: number;
    initialNodeY: number;
  } | null>(null);

  // Edge drawing state
  const [connecting, setConnecting] = useState<{
    sourceNodeId: string;
    sourceHandle: "output";
    mousePos: { x: number; y: number };
  } | null>(null);

  // Hovered edge for delete button
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  // Active drag-over state from palette items
  const [isDragOverCanvas, setIsDragOverCanvas] = useState(false);

  // Background drag panning handlers
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // Only pan if clicking canvas background (not inside nodes or handles)
    if (e.target === containerRef.current || (e.target as HTMLElement).tagName === "svg") {
      onSelectNode(null);
      if (connecting) {
        setConnecting(null);
      }
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleStartNodeDrag = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const targetNode = nodes.find((n) => n.id === nodeId);
    if (!targetNode) return;

    onSelectNode(nodeId);
    setDraggingNode({
      nodeId,
      startX: e.clientX,
      startY: e.clientY,
      initialNodeX: targetNode.position.x,
      initialNodeY: targetNode.position.y,
    });
  };

  // Connection handlers
  const handleStartConnect = (
    e: React.MouseEvent,
    nodeId: string,
    handle: string
  ) => {
    e.stopPropagation();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - pan.x) / zoom;
    const mouseY = (e.clientY - rect.top - pan.y) / zoom;

    setConnecting({
      sourceNodeId: nodeId,
      sourceHandle: "output",
      mousePos: { x: mouseX, y: mouseY },
    });
  };

  const handleEndConnect = (targetNodeId: string, _handle: string) => {
    if (!connecting) return;
    if (connecting.sourceNodeId !== targetNodeId) {
      // Check if edge already exists
      const exists = edges.some(
        (edge) =>
          edge.sourceNodeId === connecting.sourceNodeId &&
          edge.targetNodeId === targetNodeId
      );
      if (!exists) {
        onAddEdge({
          sourceNodeId: connecting.sourceNodeId,
          targetNodeId,
          sourceHandle: connecting.sourceHandle,
          targetHandle: "input",
        });
      }
    }
    setConnecting(null);
  };

  // Global mousemove / mouseup tracking for smooth dragging and connection line
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isPanning) {
        setPan({
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        });
      } else if (draggingNode) {
        const dx = (e.clientX - draggingNode.startX) / zoom;
        const dy = (e.clientY - draggingNode.startY) / zoom;
        onUpdateNodePosition(draggingNode.nodeId, {
          x: Math.round(draggingNode.initialNodeX + dx),
          y: Math.round(draggingNode.initialNodeY + dy),
        });
      } else if (connecting && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setConnecting((prev) =>
          prev
            ? {
                ...prev,
                mousePos: {
                  x: (e.clientX - rect.left - pan.x) / zoom,
                  y: (e.clientY - rect.top - pan.y) / zoom,
                },
              }
            : null
        );
      }
    },
    [isPanning, panStart, draggingNode, connecting, zoom, pan, setPan, onUpdateNodePosition]
  );

  const handleMouseUp = useCallback(() => {
    if (isPanning) setIsPanning(false);
    if (draggingNode) setDraggingNode(null);
  }, [isPanning, draggingNode]);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Drop palette items onto canvas
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
    setIsDragOverCanvas(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
    if (!isDragOverCanvas) {
      setIsDragOverCanvas(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragOverCanvas(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverCanvas(false);

    let item: PaletteItemDefinition | null = currentDraggedItem;
    if (!item) {
      try {
        const raw =
          e.dataTransfer.getData("application/workflow-node") ||
          e.dataTransfer.getData("text/plain");
        if (raw) {
          item = JSON.parse(raw);
        }
      } catch (err) {
        console.error("Failed to parse dropped workflow node:", err);
      }
    }

    if (!item || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const dropX = Math.round((e.clientX - rect.left - pan.x) / zoom - 128);
    const dropY = Math.round((e.clientY - rect.top - pan.y) / zoom - 40);

    onDropPaletteItem(item, {
      x: Math.max(20, dropX),
      y: Math.max(20, dropY),
    });
  };

  // Zoom control helpers
  const handleZoomIn = () => setZoom((z) => Math.min(2.0, Number((z + 0.15).toFixed(2))));
  const handleZoomOut = () => setZoom((z) => Math.max(0.4, Number((z - 0.15).toFixed(2))));
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Node position helper for edges
  const getNodeCenterHandles = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return null;
    return {
      outputX: node.position.x + 128, // node width 256 / 2
      outputY: node.position.y + 115, // bottom output handle
      inputX: node.position.x + 128,  // node width 256 / 2
      inputY: node.position.y,        // top input handle
    };
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleCanvasMouseDown}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative flex-1 h-full w-full overflow-hidden select-none bg-slate-50/70 dark:bg-slate-950 transition-colors ${
        isPanning
          ? "cursor-grabbing"
          : connecting
          ? "cursor-crosshair"
          : isDragOverCanvas
          ? "cursor-copy ring-2 ring-inset ring-primary/60 bg-primary/5"
          : "cursor-default"
      }`}
    >
      {/* Dynamic Dot Grid Pattern */}
      <svg
        className="absolute inset-0 h-full w-full pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="canvas-grid-pattern"
            width={28 * zoom}
            height={28 * zoom}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${pan.x}, ${pan.y})`}
          >
            <circle
              cx={2}
              cy={2}
              r={1.2}
              className="fill-slate-300/60 dark:fill-slate-700/60"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#canvas-grid-pattern)" />
      </svg>

      {/* Canvas World transformed by Pan & Zoom */}
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
        }}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className="absolute inset-0 pointer-events-auto"
      >
        {/* Render Connection Edges */}
        <svg className="absolute inset-0 h-[10000px] w-[10000px] pointer-events-none overflow-visible">
          <defs>
            <linearGradient id="edge-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
            <marker
              id="edge-arrow"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 8 5 L 0 9 z" className="fill-purple-500" />
            </marker>
          </defs>

          {edges.map((edge) => {
            const source = getNodeCenterHandles(edge.sourceNodeId);
            const target = getNodeCenterHandles(edge.targetNodeId);
            if (!source || !target) return null;

            const p1x = source.outputX;
            const p1y = source.outputY;
            const p2x = target.inputX;
            const p2y = target.inputY;

            const deltaY = Math.max(Math.abs(p2y - p1y) * 0.5, 40);
            const pathData = `M ${p1x} ${p1y} C ${p1x} ${p1y + deltaY}, ${p2x} ${p2y - deltaY}, ${p2x} ${p2y}`;
            const midX = (p1x + p2x) / 2;
            const midY = (p1y + p2y) / 2;
            const isHovered = hoveredEdgeId === edge.id;

            return (
              <g
                key={edge.id}
                className="group pointer-events-auto cursor-pointer"
                onMouseEnter={() => setHoveredEdgeId(edge.id)}
                onMouseLeave={() => setHoveredEdgeId(null)}
              >
                {/* Wide invisible hit-area path */}
                <path
                  d={pathData}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="16"
                  className="cursor-pointer"
                  onClick={() => onDeleteEdge(edge.id)}
                />
                {/* Visible curved connector */}
                <path
                  d={pathData}
                  fill="none"
                  stroke={isHovered ? "#ef4444" : "url(#edge-gradient)"}
                  strokeWidth={isHovered ? 2.5 : 2}
                  strokeDasharray={isHovered ? "4 4" : "none"}
                  markerEnd="url(#edge-arrow)"
                  className="transition-all"
                />

                {/* Delete button indicator on hover */}
                {isHovered && (
                  <foreignObject
                    x={midX - 12}
                    y={midY - 12}
                    width={24}
                    height={24}
                    className="overflow-visible"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteEdge(edge.id);
                      }}
                      title="Remove connection"
                      className="h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:scale-110 transition-transform cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </foreignObject>
                )}
              </g>
            );
          })}

          {/* Live Connecting Line when dragging from an output port */}
          {connecting && (
            (() => {
              const source = getNodeCenterHandles(connecting.sourceNodeId);
              if (!source) return null;
              const p1x = source.outputX;
              const p1y = source.outputY;
              const p2x = connecting.mousePos.x;
              const p2y = connecting.mousePos.y;
              const deltaY = Math.max(Math.abs(p2y - p1y) * 0.5, 30);
              const pathData = `M ${p1x} ${p1y} C ${p1x} ${p1y + deltaY}, ${p2x} ${p2y - deltaY}, ${p2x} ${p2y}`;

              return (
                <path
                  d={pathData}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2.5"
                  strokeDasharray="6 4"
                  className="animate-pulse"
                />
              );
            })()
          )}
        </svg>

        {/* Render Canvas Nodes */}
        {nodes.map((node) => (
          <WorkflowNodeItem
            key={node.id}
            node={node}
            isSelected={selectedNodeId === node.id}
            onSelect={onSelectNode}
            onDelete={onDeleteNode}
            onMouseDown={handleStartNodeDrag}
            onStartConnect={handleStartConnect}
            onEndConnect={handleEndConnect}
          />
        ))}
      </div>

      {/* Clean Empty Canvas State when 0 nodes exist */}
      {nodes.length === 0 && (
        <div
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="absolute inset-0 flex items-center justify-center pointer-events-none p-6"
        >
          <div
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={`max-w-md w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border ${
              isDragOverCanvas
                ? "border-primary ring-2 ring-primary/50 shadow-primary/20 scale-102"
                : "border-slate-200 dark:border-slate-800"
            } rounded-3xl p-8 text-center shadow-xl pointer-events-auto transition-all`}
          >
            <div className="h-16 w-16 mx-auto rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-5 shadow-xs">
              <WorkflowIcon className="h-8 w-8 stroke-[1.75]" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
              {isDragOverCanvas ? "Drop Node Here to Place on Canvas" : "Workflow Canvas Empty"}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
              Drag and drop functions from the left palette or start with a trigger node to begin orchestrating your autonomous workforce pipeline.
            </p>

            <button
              type="button"
              onClick={onAddInitialTrigger}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:opacity-90 active:scale-95 transition-all shadow-sm cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Add Initial Manual Trigger</span>
            </button>
          </div>
        </div>
      )}

      {/* Floating Canvas Controls (Bottom-Left) */}
      <div className="absolute bottom-5 left-5 flex items-center gap-1.5 p-1.5 rounded-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-md text-slate-700 dark:text-slate-300 z-30">
        <button
          type="button"
          onClick={handleZoomIn}
          title="Zoom In"
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          title="Zoom Out"
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="text-[11px] font-mono px-1.5 select-none font-medium min-w-[42px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 mx-0.5" />
        <button
          type="button"
          onClick={handleResetZoom}
          title="Reset Zoom & Pan"
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      {/* Canvas Interaction Hint (Bottom Center) */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border border-slate-200/60 dark:border-slate-800/60 shadow-xs text-[10px] text-slate-400 select-none pointer-events-none">
        <MousePointer className="h-3 w-3" />
        <span>Drag canvas to pan &bull; Drag node ports to connect steps</span>
      </div>
    </div>
  );
};

