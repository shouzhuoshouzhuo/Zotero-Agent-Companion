// Graph identities include the library, so equal item keys in two libraries cannot collide.
import type { WikiGraphData, WikiGraphEdge, WikiGraphNode } from "../types.ts";

export interface GraphLink { scope: string; key: string; id: string; href: string }
export function graphLink(href: string): GraphLink | null {
  const s = href.trim();
  let m = /^zotero:\/\/(?:select|open-pdf)\/(library|groups\/\d+)\/items\/([A-Z0-9]{8})(?:[?#].*)?$/.exec(s);
  if (m) return { scope: m[1]!, key: m[2]!, id: `${m[1]}:${m[2]}`, href: s };
  m = /^zotero:\/\/note\/(u|\d+)\/([A-Z0-9]{8})\/?(?:[?#].*)?$/.exec(s);
  if (m) {
    const scope = m[1] === "u" ? "library" : `groups/${m[1]}`;
    return { scope, key: m[2]!, id: `${scope}:${m[2]}`, href: s };
  }
  return null;
}

export interface GraphRecord extends WikiGraphNode { links: string[]; parent?: string; related?: string[] }
export function buildGraph(records: GraphRecord[], truncated = false, unresolved = 0): WikiGraphData {
  const nodes = new Map(records.map((r) => [r.id, r]));
  const edges = new Map<string, WikiGraphEdge>();
  const missing = new Set<string>();
  const add = (source: string, target: string, kind: WikiGraphEdge["kind"], href?: string) => {
    if (source === target) return;
    if (!nodes.has(target)) { if (kind === "link") missing.add(target); return; }
    if (kind === "related" && source > target) [source, target] = [target, source];
    const id = `${kind}:${source}>${target}`;
    let edge = edges.get(id);
    if (!edge) { edge = { source, target, kind, hrefs: [] }; edges.set(id, edge); }
    if (href && !edge.hrefs.includes(href)) edge.hrefs.push(href);
  };
  for (const r of records) {
    for (const href of r.links) { const link = graphLink(href); if (link) add(r.id, link.id, "link", href); }
    if (r.parent) add(r.parent, r.id, "parent");
    for (const related of r.related ?? []) add(r.id, related, "related");
  }
  return {
    nodes: [...nodes.values()].map(({ id, title, kind, uri, external }) => ({ id, title, kind, uri, ...(external ? { external } : {}) })),
    edges: [...edges.values()], truncated, unresolved: unresolved + missing.size,
  };
}

export function visibleGraph(data: WikiGraphData, o: { attachments: boolean; parents: boolean; query: string; focus?: string }): WikiGraphData {
  let nodes = data.nodes.filter((n) => o.attachments || n.kind !== "attachment");
  let ids = new Set(nodes.map((n) => n.id));
  let edges = data.edges.filter((e) => (o.parents || e.kind !== "parent") && ids.has(e.source) && ids.has(e.target));
  if (o.focus && ids.has(o.focus)) {
    const near = new Set([o.focus]);
    for (const e of edges) if (e.source === o.focus || e.target === o.focus) { near.add(e.source); near.add(e.target); }
    nodes = nodes.filter((n) => near.has(n.id));
  }
  const q = o.query.trim().toLocaleLowerCase();
  if (q) nodes = nodes.filter((n) => `${n.title} ${n.id}`.toLocaleLowerCase().includes(q));
  ids = new Set(nodes.map((n) => n.id));
  edges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  return { ...data, nodes, edges };
}

/** A bounded, deterministic force layout computed once per filter change (no idle animation). */
export function graphLayout(data: WikiGraphData): Map<string, { x: number; y: number }> {
  const n = data.nodes.length;
  const points = data.nodes.map((node, i) => ({ id: node.id, x: 250 + Math.cos(i * 2.39996) * (35 + Math.sqrt(i) * 18), y: 210 + Math.sin(i * 2.39996) * (35 + Math.sqrt(i) * 18), dx: 0, dy: 0 }));
  const index = new Map(points.map((p) => [p.id, p]));
  if (n === 1) { points[0]!.x = 250; points[0]!.y = 210; }
  for (let step = 0; step < 90 && n > 1; step++) {
    for (const p of points) { p.dx = (250 - p.x) * .015; p.dy = (210 - p.y) * .015; }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = points[i]!, b = points[j]!;
      const dx = a.x - b.x || .1, dy = a.y - b.y || .1;
      const d = Math.max(10, Math.hypot(dx, dy));
      const f = 3200 / (d * d);
      a.dx += dx / d * f; a.dy += dy / d * f; b.dx -= dx / d * f; b.dy -= dy / d * f;
    }
    for (const e of data.edges) {
      const a = index.get(e.source)!, b = index.get(e.target)!;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.max(1, Math.hypot(dx, dy));
      const f = (d - 125) * .018;
      a.dx += dx / d * f; a.dy += dy / d * f; b.dx -= dx / d * f; b.dy -= dy / d * f;
    }
    const cool = 1 - step / 110;
    for (const p of points) { p.x += Math.max(-8, Math.min(8, p.dx)) * cool; p.y += Math.max(-8, Math.min(8, p.dy)) * cool; }
  }
  return new Map(points.map((p) => [p.id, { x: p.x, y: p.y }]));
}
