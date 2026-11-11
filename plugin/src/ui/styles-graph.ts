// Quiet native graph: blue notes, warm paper nodes, legible labels in both themes.
export const GRAPH_STYLES = `
.zmc .graph { --graph-note: #3279c5; --graph-paper: #ba7029; --graph-attachment: #82919b; }
.zmc[data-theme="dark"] .graph { --graph-note: #79b4f5; --graph-paper: #e6ad6e; }
.zmc .graph .vw__body { padding: 0 12px 16px; }
.zmc .graph__controls { display: flex; flex-direction: column; gap: 8px; }
.zmc .graph__scopebar { display: flex; align-items: center; gap: 6px; }
.zmc .graph__scope { flex: 1; min-width: 0; width: 0; }
.zmc .graph__search { width: 100%; }
.zmc .graph__filters { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: var(--fs-2); color: var(--ink-muted); }
.zmc .graph__check { display: flex; align-items: center; gap: 4px; cursor: pointer; }
.zmc .graph__check input { accent-color: var(--graph-note); }
.zmc .graph__caption { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; margin: 12px 0 8px; }
.zmc .graph__stats { font-size: var(--fs-1); color: var(--ink-muted); }
.zmc .graph__legend { display: flex; align-items: center; gap: 10px; font-size: var(--fs-1); color: var(--ink-muted); }
.zmc .graph__legend span { display: flex; align-items: center; gap: 4px; }
.zmc .graph__legend-note::before, .zmc .graph__legend-paper::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--graph-note); }
.zmc .graph__legend-paper::before { background: var(--graph-paper); }
.zmc .graph__legend-link::before { content: ""; width: 12px; height: 1px; background: var(--ink-faint); }
.zmc .graph__stage { position: relative; border: 1px solid var(--rule); border-radius: 10px; background: var(--paper-raised); overflow: hidden; }
.zmc .graph__svg { display: block; width: 100%; height: auto; aspect-ratio: 500 / 420; min-height: 240px; touch-action: none; cursor: grab; user-select: none; }
.zmc .graph__svg:active { cursor: grabbing; }
.zmc .graph__edge { stroke: var(--rule-strong); stroke-width: 1; vector-effect: non-scaling-stroke; }
.zmc .graph__edge--parent { stroke-dasharray: 4 5; opacity: .65; }
.zmc .graph__edge--related { stroke-dasharray: 2 3; }
.zmc .graph__edge--on { stroke: var(--graph-note); stroke-width: 1.5; }
.zmc .graph__node { color: var(--graph-note); cursor: pointer; outline: none; }
.zmc .graph__node--paper { color: var(--graph-paper); }
.zmc .graph__node--attachment { color: var(--graph-attachment); }
.zmc .graph__node circle { fill: currentColor; stroke: var(--paper-raised); stroke-width: 3; }
.zmc .graph__node text { font: 11px var(--font); fill: var(--ink-muted); paint-order: stroke; stroke: var(--paper-raised); stroke-width: 3; stroke-linejoin: round; }
.zmc .graph__node--on circle, .zmc .graph__node:focus-visible circle { stroke: var(--ink); stroke-width: 2; }
.zmc .graph__node--on text, .zmc .graph__node:hover text { fill: var(--ink); font-weight: 600; }
.zmc .graph__node--dim { opacity: .55; }
.zmc .graph__message { position: absolute; inset: 30px; display: grid; place-content: center; text-align: center; font-size: var(--fs-2); color: var(--ink-muted); pointer-events: none; overflow-wrap: anywhere; }
.zmc .graph__tools { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 6px 0 12px; }
.zmc .graph__hint { margin: 0; font-size: var(--fs-1); color: var(--ink-faint); }
.zmc .graph__tools > div { display: flex; flex: none; gap: 2px; }
.zmc .graph__tool { width: 28px; height: 26px; border: 1px solid var(--rule); border-radius: 6px; background: var(--paper-raised); color: var(--ink); cursor: pointer; }
.zmc .graph__tool:hover { border-color: var(--rule-strong); }
.zmc .graph__details { border-top: 1px solid var(--rule); padding-top: 12px; }
.zmc .graph__prompt { margin: 0 0 12px; color: var(--ink-muted); font-size: var(--fs-2); }
.zmc .graph__detailhead { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.zmc .graph__detailhead > div { min-width: 0; }
.zmc .graph__detailhead h3 { margin: 4px 0 10px; font-size: var(--fs-3); line-height: 1.5; overflow-wrap: anywhere; }
.zmc .graph__detailhead > button { flex: none; }
.zmc .graph__relations { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.zmc .graph__relations section { min-width: 0; }
.zmc .graph__relations h4 { margin: 4px 0 8px; font-size: var(--fs-2); color: var(--ink-muted); font-weight: 500; }
.zmc .graph__reference { display: flex; align-items: baseline; gap: 4px; margin-bottom: 6px; }
.zmc .graph__ref { border: 0; background: none; color: var(--ink); cursor: pointer; text-align: left; padding: 0; min-width: 0; font-size: var(--fs-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.zmc .graph__ref:hover { color: var(--graph-note); }
.zmc .graph__reference .lnk { flex: none; font-size: var(--fs-1); }
.zmc .graph__meta, .zmc .graph__all { color: var(--ink-muted); font-size: var(--fs-2); }
.zmc .graph__all { margin-top: 16px; border-top: 1px solid var(--rule); padding-top: 10px; }
.zmc .graph__all summary { cursor: pointer; }
.zmc .graph__list { display: flex; flex-direction: column; margin-top: 8px; gap: 4px; }
.zmc .graph__listitem { border: none; background: transparent; text-align: left; color: var(--ink-muted); cursor: pointer; font-size: var(--fs-2); padding: 4px 0; overflow-wrap: anywhere; }
.zmc .graph__listitem:hover { color: var(--graph-note); }
`;
