"use client";

import React, { useState, useRef, useCallback } from "react";
import type {
  WorkflowNode,
  WorkflowEdge,
  WorkflowLog,
  WorkflowRunResult,
  PaletteItemDefinition,
} from "@/types/workflow";
import { WorkflowPalette } from "@/components/workflows/WorkflowPalette";
import { WorkflowCanvas } from "@/components/workflows/WorkflowCanvas";
import { WorkflowRightPane } from "@/components/workflows/WorkflowRightPane";
import { WorkflowHeader } from "@/components/workflows/WorkflowHeader";

export default function WorkflowsPage() {
  const [workflowName, setWorkflowName] = useState("Autonomous Directive Pipeline");
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Canvas pan & zoom
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // Execution & Logs
  const [isExecuting, setIsExecuting] = useState(false);
  const [logs, setLogs] = useState<WorkflowLog[]>([]);
  const [runResult, setRunResult] = useState<WorkflowRunResult | null>(null);
  const [isRightPaneOpen, setIsRightPaneOpen] = useState(true);

  // Execution cancellation ref
  const executionAbortedRef = useRef(false);

  // Add node from Palette click
  const handleAddNodeFromPalette = (item: PaletteItemDefinition) => {
    const newNodeId = `node_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    // Position cascade based on existing nodes
    const offset = (nodes.length % 6) * 40;
    const newNode: WorkflowNode = {
      id: newNodeId,
      type: item.type,
      title: item.name,
      category: item.category,
      position: { x: 120 + offset, y: 80 + offset },
      config: { ...item.defaultConfig },
      status: "idle",
    };

    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(newNodeId);
  };

  // Add node via drag & drop
  const handleDropPaletteItem = (
    item: PaletteItemDefinition,
    position: { x: number; y: number }
  ) => {
    const newNodeId = `node_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const newNode: WorkflowNode = {
      id: newNodeId,
      type: item.type,
      title: item.name,
      category: item.category,
      position,
      config: { ...item.defaultConfig },
      status: "idle",
    };

    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(newNodeId);
  };

  // Quick initial trigger creator for empty canvas
  const handleAddInitialTrigger = () => {
    const triggerNode: WorkflowNode = {
      id: `trigger_${Date.now().toString(36)}`,
      type: "manual-trigger",
      title: "Manual Trigger",
      category: "trigger",
      position: { x: 160, y: 100 },
      config: { triggerType: "manual" },
      status: "idle",
    };
    setNodes([triggerNode]);
    setSelectedNodeId(triggerNode.id);
  };

  // Move node position
  const handleUpdateNodePosition = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      setNodes((prev) =>
        prev.map((node) => (node.id === nodeId ? { ...node, position } : node))
      );
    },
    []
  );

  // Delete node
  const handleDeleteNode = (nodeId: string) => {
    setNodes((prev) => prev.filter((node) => node.id !== nodeId));
    setEdges((prev) =>
      prev.filter((edge) => edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId)
    );
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
    }
  };

  // Add connector edge
  const handleAddEdge = (edge: Omit<WorkflowEdge, "id">) => {
    const newEdge: WorkflowEdge = {
      ...edge,
      id: `edge_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
    };
    setEdges((prev) => [...prev, newEdge]);
  };

  // Delete edge
  const handleDeleteEdge = (edgeId: string) => {
    setEdges((prev) => prev.filter((edge) => edge.id !== edgeId));
  };

  // Update selected node config
  const handleUpdateSelectedNodeConfig = (config: Record<string, any>) => {
    if (!selectedNodeId) return;
    setNodes((prev) =>
      prev.map((n) => (n.id === selectedNodeId ? { ...n, config } : n))
    );
  };

  // Clear canvas
  const handleClearCanvas = () => {
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    setLogs([]);
    setRunResult(null);
  };

  // Execute workflow simulation across canvas nodes
  const handleRunWorkflow = async () => {
    if (nodes.length === 0 || isExecuting) return;

    setIsExecuting(true);
    executionAbortedRef.current = false;
    const startTime = Date.now();
    const newLogs: WorkflowLog[] = [];

    // Helper to format timestamp
    const getTimestamp = () =>
      new Date().toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

    // Reset node statuses
    setNodes((prev) => prev.map((n) => ({ ...n, status: "idle" })));

    // Initial system log
    const startLog: WorkflowLog = {
      id: `log_${Date.now()}_0`,
      timestamp: getTimestamp(),
      level: "info",
      message: `Initiating pipeline "${workflowName}" with ${nodes.length} nodes...`,
    };
    newLogs.push(startLog);
    setLogs([...newLogs]);

    // Topological/sequential simulation
    for (let i = 0; i < nodes.length; i++) {
      if (executionAbortedRef.current) break;
      const currentNode = nodes[i];

      // Mark current node running
      setNodes((prev) =>
        prev.map((n) => (n.id === currentNode.id ? { ...n, status: "running" } : n))
      );

      const stepStartLog: WorkflowLog = {
        id: `log_${Date.now()}_${i}_start`,
        timestamp: getTimestamp(),
        level: "info",
        nodeId: currentNode.id,
        nodeTitle: currentNode.title,
        message: `Executing step ${i + 1}/${nodes.length} [${currentNode.title}]`,
      };
      newLogs.push(stepStartLog);
      setLogs([...newLogs]);

      // Simulate step duration
      await new Promise((resolve) => setTimeout(resolve, 600));
      if (executionAbortedRef.current) break;

      // Mark current node success
      setNodes((prev) =>
        prev.map((n) => (n.id === currentNode.id ? { ...n, status: "success" } : n))
      );

      const stepSuccessLog: WorkflowLog = {
        id: `log_${Date.now()}_${i}_end`,
        timestamp: getTimestamp(),
        level: "success",
        nodeId: currentNode.id,
        nodeTitle: currentNode.title,
        message: `Completed step [${currentNode.title}] successfully`,
        data: {
          nodeId: currentNode.id,
          type: currentNode.type,
          outputStatus: 200,
          processedAt: new Date().toISOString(),
        },
      };
      newLogs.push(stepSuccessLog);
      setLogs([...newLogs]);
    }

    const durationMs = Date.now() - startTime;

    if (!executionAbortedRef.current) {
      const finalLog: WorkflowLog = {
        id: `log_${Date.now()}_final`,
        timestamp: getTimestamp(),
        level: "success",
        message: `Workflow completed in ${durationMs}ms. All steps resolved.`,
      };
      newLogs.push(finalLog);
      setLogs([...newLogs]);

      setRunResult({
        id: `run_${Date.now()}`,
        workflowId: `wf_${Date.now()}`,
        status: "completed",
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
        durationMs,
        output: {
          pipeline: workflowName,
          totalSteps: nodes.length,
          status: "SUCCESS",
          executionDurationMs: durationMs,
          resolvedNodes: nodes.map((n) => ({
            id: n.id,
            name: n.title,
            category: n.category,
            status: "SUCCESS",
          })),
        },
        logs: newLogs,
      });
    }

    setIsExecuting(false);
  };

  const handleStopWorkflow = () => {
    executionAbortedRef.current = true;
    setIsExecuting(false);
    setNodes((prev) =>
      prev.map((n) => (n.status === "running" ? { ...n, status: "error" } : n))
    );
    setLogs((prev) => [
      ...prev,
      {
        id: `log_${Date.now()}_stop`,
        timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
        level: "error",
        message: "Workflow run aborted by user.",
      },
    ]);
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Top Workflow Header */}
      <WorkflowHeader
        workflowName={workflowName}
        onUpdateWorkflowName={setWorkflowName}
        nodeCount={nodes.length}
        edgeCount={edges.length}
        isExecuting={isExecuting}
        onRunWorkflow={handleRunWorkflow}
        onStopWorkflow={handleStopWorkflow}
        onClearCanvas={handleClearCanvas}
        isRightPaneOpen={isRightPaneOpen}
        onToggleRightPane={() => setIsRightPaneOpen((prev) => !prev)}
      />

      {/* Main Workspace: Left Palette + Canvas + Right Pane */}
      <div className="flex flex-1 h-[calc(100%-3.5rem)] w-full overflow-hidden relative">
        {/* Left Function Palette */}
        <WorkflowPalette onAddNode={handleAddNodeFromPalette} />

        {/* Center Drag & Drop Gridded Canvas */}
        <WorkflowCanvas
          nodes={nodes}
          edges={edges}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          onUpdateNodePosition={handleUpdateNodePosition}
          onDeleteNode={handleDeleteNode}
          onAddEdge={handleAddEdge}
          onDeleteEdge={handleDeleteEdge}
          onDropPaletteItem={handleDropPaletteItem}
          onAddInitialTrigger={handleAddInitialTrigger}
          zoom={zoom}
          setZoom={setZoom}
          pan={pan}
          setPan={setPan}
        />

        {/* Right Execution, Logs & Export Pane */}
        <WorkflowRightPane
          isOpen={isRightPaneOpen}
          onToggle={() => setIsRightPaneOpen((prev) => !prev)}
          workflowName={workflowName}
          nodes={nodes}
          edges={edges}
          selectedNode={selectedNode}
          onUpdateSelectedNodeConfig={handleUpdateSelectedNodeConfig}
          onDeselectNode={() => setSelectedNodeId(null)}
          isExecuting={isExecuting}
          onRunWorkflow={handleRunWorkflow}
          onStopWorkflow={handleStopWorkflow}
          logs={logs}
          onClearLogs={() => setLogs([])}
          runResult={runResult}
        />
      </div>
    </div>
  );
}
