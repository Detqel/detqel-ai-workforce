/** A force-directed layout for the ontology graph. Deterministic: the same graph always lands the same way. */

export interface LayoutNode {
  id: string;
  group: string;
  radius: number;
}
export interface LayoutEdge {
  from: string;
  to: string;
}
export interface Point {
  x: number;
  y: number;
}
export interface GraphLayout {
  positions: Map<string, Point>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

const ITERATIONS = 320;
const AREA_PER_NODE = 9_000;
/** Pull towards the node's domain centre and towards the middle; keeps the graph compact enough to fit on screen. */
const GROUP_GRAVITY = 0.18;
const CENTRE_GRAVITY = 0.04;

/**
 * Groups (business domains) start on a ring, their nodes on smaller rings around each group centre. Nodes then
 * repel each other, edges pull related nodes together, and a weak pull keeps each node near its group, so
 * domains read as clusters while cross-domain links stay short.
 */
export function layoutGraph(nodes: LayoutNode[], edges: LayoutEdge[]): GraphLayout {
  const positions = new Map<string, Point>();
  if (!nodes.length) return { positions, bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
  const groups = [...new Set(nodes.map((node) => node.group))].sort();
  const side = Math.sqrt(AREA_PER_NODE * nodes.length);
  const k = Math.sqrt((side * side) / nodes.length);
  const groupRing = groups.length > 1 ? side * 0.32 : 0;
  const centres = new Map(groups.map((group, index) => {
    const angle = (2 * Math.PI * index) / groups.length - Math.PI / 2;
    return [group, { x: Math.cos(angle) * groupRing, y: Math.sin(angle) * groupRing }];
  }));
  const members = new Map<string, LayoutNode[]>();
  for (const node of nodes) members.set(node.group, [...(members.get(node.group) ?? []), node]);
  for (const [group, list] of members) {
    const centre = centres.get(group)!;
    const ring = Math.max(k * 0.6, Math.sqrt(list.length) * k * 0.45);
    list.forEach((node, index) => {
      const angle = index * 2.399963; // golden angle spreads nodes evenly without collisions
      const distance = ring * Math.sqrt((index + 0.5) / list.length);
      positions.set(node.id, { x: centre.x + Math.cos(angle) * distance, y: centre.y + Math.sin(angle) * distance });
    });
  }

  const ids = nodes.map((node) => node.id);
  const radius = new Map(nodes.map((node) => [node.id, node.radius]));
  const groupOf = new Map(nodes.map((node) => [node.id, node.group]));
  const links = edges.filter((edge) => positions.has(edge.from) && positions.has(edge.to) && edge.from !== edge.to);
  // Repulsion grows with the number of nodes; gravity grows more slowly, so large graphs spread but stay bounded.
  const gravityScale = Math.sqrt(nodes.length) * 1.1;
  let temperature = side / 8;
  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    const shift = new Map(ids.map((id) => [id, { x: 0, y: 0 }]));
    for (let a = 0; a < ids.length; a++) {
      const pa = positions.get(ids[a])!;
      for (let b = a + 1; b < ids.length; b++) {
        const pb = positions.get(ids[b])!;
        let dx = pa.x - pb.x;
        let dy = pa.y - pb.y;
        if (dx === 0 && dy === 0) { dx = 0.01 * (a + 1); dy = 0.01 * (b + 1); }
        const distance = Math.max(Math.hypot(dx, dy), 1);
        // Extra push when circles would overlap, so labels stay readable.
        const minimum = radius.get(ids[a])! + radius.get(ids[b])! + 28;
        const force = (k * k) / distance + (distance < minimum ? (minimum - distance) * 2 : 0);
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        shift.get(ids[a])!.x += fx; shift.get(ids[a])!.y += fy;
        shift.get(ids[b])!.x -= fx; shift.get(ids[b])!.y -= fy;
      }
    }
    for (const edge of links) {
      const pa = positions.get(edge.from)!;
      const pb = positions.get(edge.to)!;
      const dx = pa.x - pb.x;
      const dy = pa.y - pb.y;
      const distance = Math.max(Math.hypot(dx, dy), 1);
      const force = (distance * distance) / k;
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      shift.get(edge.from)!.x -= fx; shift.get(edge.from)!.y -= fy;
      shift.get(edge.to)!.x += fx; shift.get(edge.to)!.y += fy;
    }
    for (const id of ids) {
      const point = positions.get(id)!;
      const centre = centres.get(groupOf.get(id)!)!;
      const delta = shift.get(id)!;
      delta.x += ((centre.x - point.x) * GROUP_GRAVITY - point.x * CENTRE_GRAVITY) * gravityScale;
      delta.y += ((centre.y - point.y) * GROUP_GRAVITY - point.y * CENTRE_GRAVITY) * gravityScale;
      const length = Math.max(Math.hypot(delta.x, delta.y), 0.0001);
      const step = Math.min(length, temperature);
      positions.set(id, { x: point.x + (delta.x / length) * step, y: point.y + (delta.y / length) * step });
    }
    temperature *= 0.985;
  }

  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const [id, point] of positions) {
    const r = radius.get(id)! + 40;
    minX = Math.min(minX, point.x - r); minY = Math.min(minY, point.y - r);
    maxX = Math.max(maxX, point.x + r); maxY = Math.max(maxY, point.y + r);
  }
  return { positions, bounds: { minX, minY, maxX, maxY } };
}
