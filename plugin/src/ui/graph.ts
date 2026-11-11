import type { PanelHost, WikiGraphData, WikiGraphNode } from "../types.ts";
import { env, errMessage, h, icon, setKids, svg } from "./dom.ts";
import { graphLayout, graphLink, visibleGraph } from "./graph-model.ts";
import { t } from "../i18n.ts";
import { frame } from "./views.ts";

const EMPTY: WikiGraphData = { nodes: [], edges: [], truncated: false, unresolved: 0 };

export function graphView(host: Pick<PanelHost, "wikiGraph" | "open">, o: { back(): void; scope?: string }): { el: HTMLElement; refresh(): void; dispose(): void } {
  let data = EMPTY, shown = EMPTY;
  let selected: string | undefined, focused: string | undefined, scope = o.scope ?? "";
  let parents = false, attachments = false, disposed = false, generation = 0;
  let positions = new Map<string, { x: number; y: number }>();
  let tx = 0, ty = 0, scale = 1;
  let drag: { pointer: number; id?: string; x: number; y: number; moved: boolean } | undefined;
  let changeTimer: number | undefined;
  let lastTap: { id: string; time: number } | undefined;
  const scopeEl = h("select.input.graph__scope", { "aria-label": t("graph.scope") }) as HTMLSelectElement;
  const query = h("input.input.graph__search", { type: "search", placeholder: t("graph.search"), "aria-label": t("graph.search") }) as HTMLInputElement;
  const stats = h("div.graph__stats", { role: "status", "aria-live": "polite" });
  const message = h("div.graph__message", { hidden: true, role: "status" });
  const help = h("p.graph__hint", null, t("graph.hint"));
  const details = h("div.graph__details");
  const list = h("div.graph__list");
  const world = svg("g", {});
  const canvas = svg("svg", { class: "graph__svg", viewBox: "0 0 500 420", role: "group", "aria-label": t("graph.title") }, world);
  const stage = h("div.graph__stage", null, canvas, message);
  const refreshBtn = h("button.iconbtn", { type: "button", title: t("graph.refresh"), "aria-label": t("graph.refresh"), onclick: () => refresh() }, icon("retry")) as HTMLButtonElement;
  const zoom = (factor: number) => { scale = Math.max(.25, Math.min(4, scale * factor)); transform(); };
  const button = (label: string, text: string, action: () => void) => h("button.graph__tool", { type: "button", title: label, "aria-label": label, onclick: action }, text);
  const localBtn = h("button.btn.btn--sm", { type: "button", disabled: true, onclick: () => { focused = focused ? undefined : selected; paint(true); } }, t("graph.local")) as HTMLButtonElement;
  const fullList = h("details.graph__all", null, h("summary", null, t("graph.nodeList")), list);
  const checkbox = (label: string, change: (v: boolean) => void) => {
    const input = h("input", { type: "checkbox", onchange: () => change((input as HTMLInputElement).checked) });
    return h("label.graph__check", null, input, label);
  };
  const el = frame(t("graph.title"), o.back,
    h("div.graph__controls", null, h("div.graph__scopebar", null, scopeEl, refreshBtn), query,
      h("div.graph__filters", null,
        checkbox(t("graph.attachments"), (v) => { attachments = v; paint(true); }),
        checkbox(t("graph.parents"), (v) => { parents = v; paint(true); }), localBtn)),
    h("div.graph__caption", null, stats, h("div.graph__legend", null,
      h("span.graph__legend-note", null, t("graph.note")), h("span.graph__legend-paper", null, t("graph.paper")),
      h("span.graph__legend-link", null, t("graph.link")))),
    stage,
    h("div.graph__tools", null, help, h("div", null, button(t("graph.zoomOut"), "−", () => zoom(1 / 1.25)), button(t("graph.zoomIn"), "+", () => zoom(1.25)), button(t("graph.fit"), "↺", fit))),
    details, fullList);
  el.classList.add("graph");

  function transform() { world.setAttribute("transform", `translate(${tx} ${ty}) translate(250 210) scale(${scale}) translate(-250 -210)`); }
  function fit() {
    const p = [...positions.values()];
    if (!p.length) return;
    const minX = Math.min(...p.map((v) => v.x)), maxX = Math.max(...p.map((v) => v.x));
    const minY = Math.min(...p.map((v) => v.y)), maxY = Math.max(...p.map((v) => v.y));
    scale = Math.min(1.8, 320 / Math.max(1, maxX - minX), 300 / Math.max(1, maxY - minY));
    tx = (250 - (minX + maxX) / 2) * scale; ty = (210 - (minY + maxY) / 2) * scale;
    transform();
  }
  function select(id: string) { selected = id; paint(false); }
  async function open(node: WikiGraphNode, uri = node.uri) {
    const link = graphLink(uri);
    const target = link && uri.startsWith("zotero://note/") ? `zotero://select/${link.scope}/items/${link.key}` : uri.split("#")[0]!;
    try { await host.open(target); } catch (e) { stats.textContent = t("graph.openError", { error: errMessage(e) }); }
  }
  const short = (title: string) => {
    const s = title.replace(/^\d+\s*[｜|]\s*/, "");
    return [...s].length > 11 ? [...s].slice(0, 10).join("") + "…" : s;
  };
  function draw() {
    const near = new Set([selected]);
    for (const e of shown.edges) if (e.source === selected || e.target === selected) { near.add(e.source); near.add(e.target); }
    const children: SVGElement[] = [];
    for (const e of shown.edges) {
      const a = positions.get(e.source)!, b = positions.get(e.target)!;
      children.push(svg("line", { x1: String(a.x), y1: String(a.y), x2: String(b.x), y2: String(b.y), class: `graph__edge graph__edge--${e.kind}${selected && (e.source === selected || e.target === selected) ? " graph__edge--on" : ""}` }));
    }
    const degrees = new Map<string, number>();
    for (const e of shown.edges) { degrees.set(e.source, (degrees.get(e.source) ?? 0) + 1); degrees.set(e.target, (degrees.get(e.target) ?? 0) + 1); }
    for (const n of shown.nodes) {
      const p = positions.get(n.id)!;
      const group = svg("g", { transform: `translate(${p.x} ${p.y})`, class: `graph__node graph__node--${n.kind}${selected === n.id ? " graph__node--on" : ""}${selected && !near.has(n.id) ? " graph__node--dim" : ""}`, tabindex: "0", role: "button", "aria-label": n.title, "aria-pressed": String(selected === n.id), "data-id": n.id },
        svg("title", {}, env.doc.createTextNode(n.title)),
        svg("circle", { r: String(7 + Math.min(7, Math.sqrt(degrees.get(n.id) ?? 0) * 1.8)) }),
        svg("text", { y: "29", "text-anchor": "middle" }, env.doc.createTextNode(short(n.title))));
      group.addEventListener("click", (e) => { e.stopPropagation(); if (!drag?.moved) select(n.id); });
      group.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); select(n.id); }
      });
      children.push(group);
    }
    world.replaceChildren(...children);
    transform();
  }
  function detail() {
    const n = data.nodes.find((v) => v.id === selected);
    localBtn.disabled = !n;
    localBtn.textContent = t(focused ? "graph.all" : "graph.local");
    if (!n) { setKids(details, h("p.graph__prompt", null, t("graph.select"))); return; }
    const incoming = data.edges.filter((e) => e.kind === "link" && e.target === n.id);
    const outgoing = data.edges.filter((e) => e.kind === "link" && e.source === n.id);
    const links = (edges: typeof incoming, inbound: boolean) => edges.map((e) => {
      const other = data.nodes.find((v) => v.id === (inbound ? e.source : e.target))!;
      return h("div.graph__reference", null,
        h("button.graph__ref", { type: "button", title: other.title, onclick: () => select(other.id) }, short(other.title)),
        h("button.lnk", { type: "button", onclick: () => void open(other, inbound ? other.uri : e.hrefs[0] ?? other.uri) }, t("graph.open")));
    });
    setKids(details, h("div.graph__detailhead", null,
      h("div", null, h("div.eyebrow", null, t(`graph.${n.kind}`)), h("h3", null, n.title)),
      h("button.btn.btn--sm", { type: "button", onclick: () => void open(n) }, t("graph.open"))),
      n.external ? h("p.graph__meta", null, t("graph.external")) : null,
      h("div.graph__relations", null,
        h("section", null, h("h4", null, t("graph.incoming", { n: incoming.length })), links(incoming, true)),
        h("section", null, h("h4", null, t("graph.outgoing", { n: outgoing.length })), links(outgoing, false))));
  }
  function paint(layout: boolean) {
    shown = visibleGraph(data, { attachments, parents, query: query.value, ...(focused ? { focus: focused } : {}) });
    if (layout) positions = graphLayout(shown);
    // Selection can be kept in the inspector when a filter hides it.
    stats.textContent = t("graph.count", { n: shown.nodes.length, e: shown.edges.length });
    if (data.truncated) stats.textContent += ` · ${t("graph.limited")}`;
    if (data.unresolved) stats.textContent += ` · ${t("graph.unresolved", { n: data.unresolved })}`;
    message.hidden = shown.nodes.length > 0;
    message.textContent = t(data.nodes.length ? "graph.noMatch" : "graph.empty");
    draw(); detail();
    setKids(list, shown.nodes.map((n) => h("button.graph__listitem", { type: "button", onclick: () => select(n.id) }, n.title)));
    if (layout) fit();
  }
  function point(e: PointerEvent | WheelEvent) {
    const matrix = (canvas as SVGSVGElement).getScreenCTM();
    if (matrix) {
      const p = new env.win.DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
      // DOMPoint coordinates are prototype accessors, not enumerable own properties.
      // Spreading a DOMPoint into drag state drops x/y and produces NaN on pointermove.
      return { x: p.x, y: p.y };
    }
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * 500 / Math.max(1, rect.width), y: (e.clientY - rect.top) * 420 / Math.max(1, rect.height) };
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const target = (e.target as Element).closest("[data-id]");
    const p = point(e);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    drag = { pointer: e.pointerId, ...(target?.getAttribute("data-id") ? { id: target.getAttribute("data-id")! } : {}), x: p.x, y: p.y, moved: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag || drag.pointer !== e.pointerId) return;
    const p = point(e), dx = p.x - drag.x, dy = p.y - drag.y;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    drag.moved = true;
    if (drag.id) { const pos = positions.get(drag.id); if (pos) { pos.x += dx / scale; pos.y += dy / scale; } draw(); }
    else { tx += dx; ty += dy; transform(); }
    drag.x = p.x; drag.y = p.y;
  });
  const endDrag = (e: PointerEvent) => {
    if (!drag || drag.pointer !== e.pointerId) return;
    const state = drag;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (!state.moved && state.id) {
      if (lastTap?.id === state.id && Date.now() - lastTap.time < 400) {
        const node = data.nodes.find((n) => n.id === state.id);
        if (node) void open(node);
        lastTap = undefined;
      } else lastTap = { id: state.id, time: Date.now() };
      select(state.id);
    }
    // Keep the moved flag through the browser's synthesized click.
    env.win.setTimeout(() => { if (drag === state) drag = undefined; }, 0);
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", () => { drag = undefined; });
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
  scopeEl.addEventListener("change", () => { scope = scopeEl.value; selected = focused = undefined; query.value = ""; void refresh(); });
  query.addEventListener("input", () => paint(true));

  async function refresh() {
    if (disposed) return;
    const run = ++generation;
    refreshBtn.disabled = true;
    stats.textContent = t("graph.loading");
    try {
      if (!host.wikiGraph) throw new Error(t("graph.unavailable"));
      const scopes = await host.wikiGraph.scopes();
      if (disposed || run !== generation) return;
      if (!scopes.scopes.some((s) => s.id === scope)) scope = scopes.current;
      setKids(scopeEl, scopes.scopes.map((s) => h("option", { value: s.id }, s.name)));
      scopeEl.value = scope;
      const result = await host.wikiGraph.read(scope);
      if (disposed || run !== generation) return;
      data = result;
      if (selected && !data.nodes.some((n) => n.id === selected)) selected = focused = undefined;
      paint(true);
    } catch (e) {
      if (disposed || run !== generation) return;
      data = EMPTY; positions.clear(); world.replaceChildren(); details.replaceChildren(); list.replaceChildren();
      message.hidden = false; message.textContent = t("graph.error", { error: errMessage(e) });
      stats.textContent = t("graph.failed");
    } finally { if (!disposed && run === generation) refreshBtn.disabled = false; }
  }
  const off = host.wikiGraph?.onChange?.(() => {
    if (changeTimer !== undefined) env.win.clearTimeout(changeTimer);
    changeTimer = env.win.setTimeout(() => { if (!disposed) void refresh(); }, 500);
  });
  detail();
  return { el, refresh, dispose() { disposed = true; generation++; off?.(); if (changeTimer !== undefined) env.win.clearTimeout(changeTimer); } };
}
