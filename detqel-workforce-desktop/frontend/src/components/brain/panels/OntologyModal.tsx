"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Database, KeyRound, Lock, Maximize2, Minus, Network, Plus, Search, Sparkles, X } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { brainApi, type BrainOntologyEdge, type BrainOntologyGraph, type BrainOntologyNode } from "@/lib/api/brain";
import { layoutGraph, type Point } from "@/lib/ontology-layout";
import { useWorkspaceQuery } from "@/hooks/useBrainQuery";
import { IconOnlyButton } from "@/components/ui/icon-only-button";
import { SecondaryButton } from "@/components/ui/secondary-button";
import { BrainModal } from "./BrainModal";
import { formatDateTime, PanelState, Pill, SectionTitle, statusTone } from "./panelParts";

/** Domain colours: readable as fills on light and dark backgrounds. */
const PALETTE = ["#7c3aed", "#2563eb", "#059669", "#d97706", "#db2777", "#0891b2", "#65a30d", "#dc2626", "#4f46e5", "#0d9488"];
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;
const NO_DOMAIN = "Unassigned";
const CLICK_TOLERANCE_PX = 4;

interface View { x: number; y: number; k: number }

const nodeRadius = (node: BrainOntologyNode) => Math.min(34, 18 + 5 * Math.log10(1 + node.entityCount));
const primaryDomain = (node: BrainOntologyNode) => node.domains[0] ?? NO_DOMAIN;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "?";
const compact = (value: number) => (value >= 1_000_000 ? `${Math.round(value / 100_000) / 10}M` : value >= 10_000 ? `${Math.round(value / 100) / 10}K` : String(value));
const methodLabel = (method: string) => (method === "foreign_key" ? "Foreign key" : method === "naming" ? "Name match" : "Defined");

interface OntologyModalProps {
  onClose: () => void;
  onOpenDataLayer: () => void;
}

/**
 * The automatically derived ontology as an interactive graph. Read-only: types, properties and relationships are
 * built from the synced data, so there is nothing to edit here. Click a node to see what it is, how it relates to
 * the rest of the business, its properties and where its data comes from.
 */
export const OntologyModal: React.FC<OntologyModalProps> = ({ onClose, onOpenDataLayer }) => {
  const { currentWorkspace } = useWorkspace();
  const graph = useWorkspaceQuery(currentWorkspace?.id ?? null, brainApi.ontologyGraph);
  const summary = graph.data?.summary;

  return (
    <BrainModal title="Ontology & Rules" subtitle="Your business model, built automatically from every linked source." icon={Network} size="xl" onClose={onClose}>
      {summary && summary.entityTypes > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-slate-200/80 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800">
          {([
            ["Entity types", summary.entityTypes],
            ["Relationships", summary.relationships],
            ["Entities", summary.entities],
            ["Linked pairs", summary.links],
            ["Sources", summary.sources.length],
          ] as const).map(([label, value]) => (
            <div key={label} className="bg-white dark:bg-[#182234] px-4 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
              <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">{compact(value)}</p>
            </div>
          ))}
        </div>
      )}
      <div className="p-4">
        {!currentWorkspace && <PanelState empty emptyText="Select a workspace to view its ontology." />}
        {currentWorkspace && (
          <PanelState loading={graph.loading} error={graph.error}>
            {graph.data && graph.data.nodes.length > 0 ? (
              <OntologyGraphView graph={graph.data} />
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 py-14 px-6 text-center space-y-3">
                <div className="mx-auto w-11 h-11 rounded-2xl bg-primary-muted text-primary flex items-center justify-center">
                  <Sparkles className="w-5 h-5" aria-hidden="true" />
                </div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">The ontology builds itself</p>
                <p className="mx-auto max-w-md text-xs text-slate-500 dark:text-slate-400">
                  Link a business source and load its data. As each table syncs, its entity type, properties and relationships to the rest of your business appear here.
                </p>
                <SecondaryButton value="Open Data Layer" icon={<ArrowRight className="w-3 h-3" />} className="mx-auto px-3 py-1.5 text-[11px]" onClick={onOpenDataLayer} />
              </div>
            )}
          </PanelState>
        )}
      </div>
    </BrainModal>
  );
};

const OntologyGraphView: React.FC<{ graph: BrainOntologyGraph }> = ({ graph }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hiddenDomains, setHiddenDomains] = useState<Set<string>>(new Set());
  const [moved, setMoved] = useState<Map<string, Point>>(new Map());
  const [drag, setDrag] = useState<{ kind: "pan" | "node"; id?: string; startX: number; startY: number; origin: Point; travelled: number } | null>(null);

  const domains = useMemo(() => [...new Set(graph.nodes.map(primaryDomain))].sort(), [graph.nodes]);
  const colour = useCallback((domain: string) => PALETTE[Math.max(0, domains.indexOf(domain)) % PALETTE.length], [domains]);
  const visibleNodes = useMemo(() => graph.nodes.filter((node) => !hiddenDomains.has(primaryDomain(node))), [graph.nodes, hiddenDomains]);
  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const visibleEdges = useMemo(() => graph.edges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to)), [graph.edges, visibleIds]);
  const layout = useMemo(
    () => layoutGraph(graph.nodes.map((node) => ({ id: node.id, group: primaryDomain(node), radius: nodeRadius(node) })), graph.edges.map((edge) => ({ from: edge.from, to: edge.to }))),
    [graph.nodes, graph.edges],
  );
  const positionOf = useCallback((id: string) => moved.get(id) ?? layout.positions.get(id) ?? { x: 0, y: 0 }, [moved, layout]);
  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fit = useMemo<View>(() => {
    const { minX, minY, maxX, maxY } = layout.bounds;
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);
    if (!size.width || !size.height) return { x: 0, y: 0, k: 1 };
    const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(size.width / width, size.height / height) * 0.92));
    return { k, x: size.width / 2 - ((minX + maxX) / 2) * k, y: size.height / 2 - ((minY + maxY) / 2) * k };
  }, [layout.bounds, size]);
  const current = view ?? fit;

  // Wheel zoom needs a non-passive listener so the modal does not scroll while zooming.
  useEffect(() => {
    const element = svgRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = element.getBoundingClientRect();
      const px = event.clientX - box.left;
      const py = event.clientY - box.top;
      setView((previous) => {
        const base = previous ?? fit;
        const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, base.k * Math.exp(-event.deltaY * 0.0015)));
        return { k, x: px - ((px - base.x) / base.k) * k, y: py - ((py - base.y) / base.k) * k };
      });
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [fit]);

  const zoomBy = (factor: number) =>
    setView((previous) => {
      const base = previous ?? fit;
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, base.k * factor));
      const cx = size.width / 2;
      const cy = size.height / 2;
      return { k, x: cx - ((cx - base.x) / base.k) * k, y: cy - ((cy - base.y) / base.k) * k };
    });

  const focusNode = (id: string) => {
    const point = positionOf(id);
    const k = Math.max(current.k, 1);
    // Leave room for the detail panel on the right.
    setView({ k, x: (size.width - 340) / 2 - point.x * k, y: size.height / 2 - point.y * k });
    setSelectedId(id);
  };

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? visibleNodes.filter((node) => node.name.toLowerCase().includes(term) || node.attributes.some((attribute) => attribute.name.toLowerCase().includes(term))) : [];
  }, [query, visibleNodes]);
  const matchIds = useMemo(() => new Set(matches.map((node) => node.id)), [matches]);

  const active = selectedId ?? hoveredId;
  const neighbours = useMemo(() => {
    if (!active) return null;
    const set = new Set([active]);
    for (const edge of visibleEdges) {
      if (edge.from === active) set.add(edge.to);
      if (edge.to === active) set.add(edge.from);
    }
    return set;
  }, [active, visibleEdges]);

  const onPointerDown = (event: React.PointerEvent, nodeId?: string) => {
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    setDrag({ kind: nodeId ? "node" : "pan", id: nodeId, startX: event.clientX, startY: event.clientY, origin: nodeId ? positionOf(nodeId) : { x: current.x, y: current.y }, travelled: 0 });
  };
  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    setDrag({ ...drag, travelled: Math.max(drag.travelled, Math.hypot(dx, dy)) });
    if (drag.kind === "pan") setView({ ...current, x: drag.origin.x + dx, y: drag.origin.y + dy });
    else if (drag.id) setMoved((previous) => new Map(previous).set(drag.id!, { x: drag.origin.x + dx / current.k, y: drag.origin.y + dy / current.k }));
  };
  const onPointerUp = () => {
    if (drag && drag.travelled < CLICK_TOLERANCE_PX) setSelectedId(drag.kind === "node" ? drag.id ?? null : null);
    setDrag(null);
  };

  const selected = selectedId ? nodeById.get(selectedId) ?? null : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && matches[0]) focusNode(matches[0].id); }}
            placeholder="Find an entity or property"
            aria-label="Find an entity or property"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#131c2d] pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-ring"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Domains">
          {domains.map((domain) => {
            const hidden = hiddenDomains.has(domain);
            return (
              <button
                key={domain}
                type="button"
                aria-pressed={!hidden}
                onClick={() => setHiddenDomains((previous) => { const next = new Set(previous); if (hidden) next.delete(domain); else next.add(domain); return next; })}
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${hidden ? "border-slate-200 dark:border-slate-700 text-slate-400 line-through" : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-primary-border"}`}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colour(domain), opacity: hidden ? 0.35 : 1 }} aria-hidden="true" />
                {domain}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5"><svg width="22" height="6" aria-hidden="true"><line x1="0" y1="3" x2="22" y2="3" stroke="currentColor" strokeWidth="1.6" /></svg>Foreign key</span>
          <span className="inline-flex items-center gap-1.5"><svg width="22" height="6" aria-hidden="true"><line x1="0" y1="3" x2="22" y2="3" stroke="currentColor" strokeWidth="1.6" strokeDasharray="4 3" /></svg>Name match</span>
        </div>
      </div>

      <div ref={containerRef} className="[--brain-graph-halo:rgba(248,250,252,0.85)] dark:[--brain-graph-halo:rgba(15,23,38,0.9)] relative h-[62vh] min-h-[420px] rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden bg-[radial-gradient(circle_at_1px_1px,rgb(148_163_184/0.22)_1px,transparent_0)] [background-size:22px_22px] bg-slate-50/70 dark:bg-[#0f1726]">
        <svg
          ref={svgRef}
          width={size.width}
          height={size.height}
          className={`block select-none touch-none ${drag?.kind === "pan" ? "cursor-grabbing" : "cursor-grab"}`}
          onPointerDown={(event) => onPointerDown(event)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => { setHoveredId(null); if (drag) setDrag(null); }}
          role="img"
          aria-label={`Ontology graph with ${visibleNodes.length} entity types and ${visibleEdges.length} relationships`}
        >
          <defs>
            <marker id="ontology-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="fill-slate-400 dark:fill-slate-500" />
            </marker>
            <marker id="ontology-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="fill-primary" />
            </marker>
          </defs>
          <g transform={`translate(${current.x},${current.y}) scale(${current.k})`}>
            {visibleEdges.map((edge) => (
              <EdgePath key={edge.id} edge={edge} from={positionOf(edge.from)} to={positionOf(edge.to)} fromRadius={nodeRadius(nodeById.get(edge.from)!)} toRadius={nodeRadius(nodeById.get(edge.to)!)}
                highlighted={Boolean(active && (edge.from === active || edge.to === active))} dimmed={Boolean(neighbours && !(edge.from === active || edge.to === active))} showLabel={current.k > 0.7 && Boolean(active && (edge.from === active || edge.to === active))} />
            ))}
            {visibleNodes.map((node) => {
              const point = positionOf(node.id);
              const r = nodeRadius(node);
              const fill = colour(primaryDomain(node));
              const isSelected = node.id === selectedId;
              const dimmed = Boolean((neighbours && !neighbours.has(node.id)) || (matchIds.size && !matchIds.has(node.id)));
              return (
                <g
                  key={node.id}
                  transform={`translate(${point.x},${point.y})`}
                  className="cursor-pointer"
                  style={{ opacity: dimmed ? 0.22 : 1, transition: "opacity 150ms" }}
                  onPointerDown={(event) => onPointerDown(event, node.id)}
                  onPointerEnter={() => setHoveredId(node.id)}
                  onPointerLeave={() => setHoveredId((previous) => (previous === node.id ? null : previous))}
                  role="button"
                  aria-label={`${node.name}, ${node.entityCount} entities`}
                  tabIndex={0}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); focusNode(node.id); } }}
                >
                  {isSelected && <circle r={r + 9} fill={fill} opacity={0.16} />}
                  <circle r={r} fill={fill} fillOpacity={0.14} stroke={fill} strokeWidth={isSelected ? 3 : 1.6} className="transition-[stroke-width]" />
                  <circle r={r - 6} fill={fill} fillOpacity={0.9} />
                  <text textAnchor="middle" dominantBaseline="central" className="fill-white font-bold pointer-events-none" style={{ fontSize: Math.max(10, r * 0.5) }}>{initials(node.name)}</text>
                  <text y={r + 14} textAnchor="middle" className="fill-slate-800 dark:fill-slate-100 font-semibold pointer-events-none" style={{ fontSize: 12, paintOrder: "stroke" }} stroke="var(--brain-graph-halo, rgba(248,250,252,0.85))" strokeWidth={3}>{node.name}</text>
                  <text y={r + 28} textAnchor="middle" className="fill-slate-500 dark:fill-slate-400 pointer-events-none" style={{ fontSize: 10 }}>{compact(node.entityCount)} entities</text>
                </g>
              );
            })}
          </g>
        </svg>

        <div className="absolute left-3 bottom-3 flex flex-col gap-1 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white/90 dark:bg-[#182234]/90 backdrop-blur p-1 shadow-xs">
          <IconOnlyButton aria-label="Zoom in" onClick={() => zoomBy(1.25)} icon={<Plus className="w-3.5 h-3.5" />} className="rounded-lg" />
          <IconOnlyButton aria-label="Zoom out" onClick={() => zoomBy(0.8)} icon={<Minus className="w-3.5 h-3.5" />} className="rounded-lg" />
          <IconOnlyButton aria-label="Fit to view" onClick={() => { setView(null); setMoved(new Map()); }} icon={<Maximize2 className="w-3.5 h-3.5" />} className="rounded-lg" />
        </div>
        {!selected && (
          <p className="absolute right-3 bottom-3 rounded-lg bg-white/90 dark:bg-[#182234]/90 backdrop-blur px-2.5 py-1 text-[10px] text-slate-500 dark:text-slate-400 shadow-xs">
            Click an entity for details · drag to move · scroll to zoom
          </p>
        )}

        {selected && (
          <NodeDetail
            node={selected}
            colour={colour(primaryDomain(selected))}
            edges={graph.edges}
            nodeById={nodeById}
            onSelect={focusNode}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
};

const EdgePath: React.FC<{ edge: BrainOntologyEdge; from: Point; to: Point; fromRadius: number; toRadius: number; highlighted: boolean; dimmed: boolean; showLabel: boolean }> = ({
  edge, from, to, fromRadius, toRadius, highlighted, dimmed, showLabel,
}) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(Math.hypot(dx, dy), 1);
  // A gentle bend keeps edges in both directions between two types apart.
  const bend = Math.min(40, length * 0.12);
  const mx = (from.x + to.x) / 2 - (dy / length) * bend;
  const my = (from.y + to.y) / 2 + (dx / length) * bend;
  const start = { x: from.x + ((mx - from.x) / Math.hypot(mx - from.x, my - from.y)) * fromRadius, y: from.y + ((my - from.y) / Math.hypot(mx - from.x, my - from.y)) * fromRadius };
  const endLength = Math.max(Math.hypot(to.x - mx, to.y - my), 1);
  const end = { x: to.x - ((to.x - mx) / endLength) * (toRadius + 3), y: to.y - ((to.y - my) / endLength) * (toRadius + 3) };
  return (
    <g style={{ opacity: dimmed ? 0.12 : 1, transition: "opacity 150ms" }}>
      <path
        d={`M${start.x},${start.y} Q${mx},${my} ${end.x},${end.y}`}
        fill="none"
        strokeWidth={highlighted ? 2.4 : 1.4}
        strokeDasharray={edge.method === "naming" ? "6 4" : undefined}
        markerEnd={`url(#${highlighted ? "ontology-arrow-active" : "ontology-arrow"})`}
        className={highlighted ? "stroke-primary" : "stroke-slate-300 dark:stroke-slate-600"}
      >
        <title>{`${edge.name} · via ${edge.fromAttribute} · ${methodLabel(edge.method)} · ${edge.links} linked`}</title>
      </path>
      {showLabel && (
        <text x={mx} y={my} textAnchor="middle" dominantBaseline="central" className="fill-primary font-semibold pointer-events-none" style={{ fontSize: 10, paintOrder: "stroke" }} stroke="var(--brain-graph-halo, rgba(248,250,252,0.9))" strokeWidth={4}>
          {edge.fromAttribute}
        </text>
      )}
    </g>
  );
};

interface NodeDetailProps {
  node: BrainOntologyNode;
  colour: string;
  edges: BrainOntologyEdge[];
  nodeById: Map<string, BrainOntologyNode>;
  onSelect: (id: string) => void;
  onClose: () => void;
}

/** What a node is, what it relates to, its properties and where its data comes from. */
const NodeDetail: React.FC<NodeDetailProps> = ({ node, colour, edges, nodeById, onSelect, onClose }) => {
  const outgoing = edges.filter((edge) => edge.from === node.id && nodeById.has(edge.to));
  const incoming = edges.filter((edge) => edge.to === node.id && nodeById.has(edge.from));
  const restricted = node.attributes.filter((attribute) => attribute.classification === "restricted").length;
  return (
    <aside
      aria-label={`${node.name} details`}
      className="absolute top-3 right-3 bottom-3 w-[min(340px,calc(100%-24px))] rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white/95 dark:bg-[#182234]/95 backdrop-blur shadow-lg flex flex-col overflow-hidden animate-in slide-in-from-right-4 fade-in duration-150"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: colour }}>{initials(node.name)}</span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{node.name}</h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Entity type · v{node.version} · since {formatDateTime(node.effectiveFrom)}</p>
            </div>
          </div>
          <IconOnlyButton aria-label="Close details" onClick={onClose} icon={<X className="w-3.5 h-3.5" />} className="rounded-lg shrink-0" />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {node.domains.map((domain) => <Pill key={domain} tone="primary">{domain}</Pill>)}
          <Pill tone="emerald">auto-derived</Pill>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 select-text">
        {node.description && <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{node.description}</p>}

        <div className="grid grid-cols-4 gap-1.5">
          {([["Entities", compact(node.entityCount)], ["Properties", node.attributes.length], ["Links", outgoing.length + incoming.length], ["Sources", node.sources.length]] as const).map(([label, value]) => (
            <div key={label} className="rounded-lg bg-slate-50 dark:bg-[#131c2d] px-2 py-1.5 text-center">
              <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
              <p className="text-[9px] uppercase tracking-wider text-slate-400">{label}</p>
            </div>
          ))}
        </div>

        <section>
          <SectionTitle>Related</SectionTitle>
          {outgoing.length + incoming.length === 0 ? (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">No relationships to other entity types yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {outgoing.map((edge) => <RelatedRow key={edge.id} edge={edge} other={nodeById.get(edge.to)!} direction="out" onSelect={onSelect} />)}
              {incoming.map((edge) => <RelatedRow key={edge.id} edge={edge} other={nodeById.get(edge.from)!} direction="in" onSelect={onSelect} />)}
            </ul>
          )}
        </section>

        <section>
          <SectionTitle>Properties</SectionTitle>
          {restricted > 0 && (
            <p className="mb-2 flex items-start gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1.5 text-[10px] text-emerald-800 dark:text-emerald-300">
              <Lock className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
              {restricted} personal-data propert{restricted === 1 ? "y is" : "ies are"} stored as pseudonyms and visible only to owners and administrators.
            </p>
          )}
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {node.attributes.map((attribute) => (
              <li key={attribute.key} className="flex items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 flex items-center gap-1.5">
                  {attribute.identifier ? <KeyRound className="w-3 h-3 text-amber-500 shrink-0" aria-label="Identifier" /> : attribute.classification === "restricted" ? <Lock className="w-3 h-3 text-emerald-600 shrink-0" aria-label="Personal data" /> : <span className="w-3 shrink-0" />}
                  <span className="text-[11px] font-medium text-slate-800 dark:text-slate-100 truncate">{attribute.name}</span>
                  {attribute.key === node.displayAttribute && <Pill tone="blue">name</Pill>}
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  {attribute.required && <span className="text-[9px] text-slate-400">required</span>}
                  <code className="text-[10px] text-slate-500 dark:text-slate-400">{attribute.type}</code>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <SectionTitle>Sources</SectionTitle>
          <ul className="space-y-1.5">
            {node.sources.map((source) => (
              <li key={source.datasetId} className="rounded-lg border border-slate-200/80 dark:border-slate-800 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Database className="w-3 h-3 text-slate-400 shrink-0" aria-hidden="true" />
                    <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-100 truncate">{source.name}</span>
                  </span>
                  <Pill tone={statusTone(source.zone)}>{source.zone}</Pill>
                </div>
                <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 truncate">
                  {source.source ?? "Revoked source"}{source.table ? ` · ${source.table.schema}.${source.table.name}` : ""} · {compact(source.records)} records · synced {formatDateTime(source.lastSuccessAt)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <p className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400">
        Derived from the source schema on every sync. Changes are versioned and audited.
      </p>
    </aside>
  );
};

const RelatedRow: React.FC<{ edge: BrainOntologyEdge; other: BrainOntologyNode; direction: "in" | "out"; onSelect: (id: string) => void }> = ({ edge, other, direction, onSelect }) => (
  <li>
    <button
      type="button"
      onClick={() => onSelect(other.id)}
      className="w-full text-left rounded-lg border border-slate-200/80 dark:border-slate-800 hover:border-primary-border px-2.5 py-1.5 transition-colors cursor-pointer group"
      title={edge.description ?? undefined}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-600 dark:text-slate-300 min-w-0 truncate">
          {direction === "out" ? "References " : "Referenced by "}
          <strong className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-primary">{other.name}</strong>
        </span>
        <Pill tone={edge.method === "foreign_key" ? "emerald" : "slate"}>{methodLabel(edge.method)}</Pill>
      </span>
      <span className="block text-[10px] text-slate-400 truncate">via {edge.fromAttribute} · {compact(edge.links)} linked</span>
    </button>
  </li>
);
