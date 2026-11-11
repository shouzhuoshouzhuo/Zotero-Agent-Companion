import type { WikiDocument } from "../wiki-document.ts";
import { graphView } from "../ui/graph.ts";
import { h, initEnv, clear } from "../ui/dom.ts";
import { STYLES } from "../ui/styles.ts";
import { resolveLanguage, setLanguage } from "../i18n.ts";
import { createWikiGraph } from "./graph.ts";
import { openTarget } from "./open.ts";
import { prefs } from "./settings.ts";

const MAIN_STYLES = `
:host { display: block; height: 100%; width: 100%; }
.zmc.zmc--graph-document { width: 100%; height: 100%; }
.zmc--graph-document .graph .vw__body { display: grid; grid-template-columns: minmax(0, 1fr) 300px; grid-template-rows: auto auto minmax(0, 1fr) auto; gap: 8px 24px; padding: 8px 24px 20px; overflow: hidden; }
.zmc--graph-document .graph__controls { grid-column: 1; grid-row: 1; display: grid; grid-template-columns: minmax(160px, 1fr) minmax(160px, 1fr); }
.zmc--graph-document .graph__filters { grid-column: 1 / -1; }
.zmc--graph-document .graph__caption { grid-column: 1; grid-row: 2; margin: 4px 0; }
.zmc--graph-document .graph__stage { grid-column: 1; grid-row: 3; min-height: 0; }
.zmc--graph-document .graph__svg { width: 100%; height: 100%; min-height: 0; aspect-ratio: auto; }
.zmc--graph-document .graph__node circle { r: 6px; stroke-width: 1.5; }
.zmc--graph-document .graph__node text { font-size: 7px; transform: translateY(-12px); stroke-width: 2; }
.zmc--graph-document .graph__tools { grid-column: 1; grid-row: 4; margin: 0; }
.zmc--graph-document .graph__side { grid-column: 2; grid-row: 1 / -1; min-height: 0; overflow: auto; border-left: 1px solid var(--rule); padding-left: 20px; }
.zmc--graph-document .graph__details { border-top: 0; padding-top: 0; }
.zmc--graph-document .graph__relations { grid-template-columns: 1fr; }
@media (max-width: 760px) {
 .zmc--graph-document .graph .vw__body { grid-template-columns: minmax(0, 1fr) 220px; gap: 8px 12px; padding: 8px 12px 16px; }
 .zmc--graph-document .graph__controls { grid-template-columns: minmax(0, 1fr); }
 .zmc--graph-document .graph__side { padding-left: 12px; }
}
`;

/** Each tab is loaded in its own panel.js scope, keeping DOM helpers and language state isolated. */
export function createGraphTab(win: any, item: any, doc: WikiDocument, closed: () => void) {
  let view: ReturnType<typeof graphView> | undefined;
  let disposed = false;
  const dark = win.matchMedia("(prefers-color-scheme: dark)");
  let app: HTMLElement | undefined;
  const theme = () => { if (app) app.dataset.theme = dark.matches ? "dark" : "light"; };
  const tab = win.Zotero_Tabs.add({ type: "zmcwikigraph", title: doc.title, data: { graphItemID: item.id, graphTitle: doc.title }, select: true,
    onClose: () => { dispose(); closed(); } });
  const host = win.document.createElementNS("http://www.w3.org/1999/xhtml", "div");
  host.style.cssText = "width:100%;height:100%;min-height:0;display:flex;flex:1";
  tab.container.append(host);
  const root = host.attachShadow({ mode: "open" });
  initEnv(root);
  setLanguage(resolveLanguage(prefs.json<{ uiLanguage?: string }>("settings", {}).uiLanguage ?? "", Zotero.locale));
  const graph = createWikiGraph(win, item.libraryID);
  view = graphView({ wikiGraph: graph, open: (target) => openTarget(win, target) }, { scope: `lib:${item.libraryID}:${doc.collectionKey}`, back: () => win.Zotero_Tabs.select("zotero-pane") });
  const body = view.el.querySelector(".vw__body")!;
  const side = h("aside.graph__side", { "aria-label": "节点与链接" });
  side.append(view.el.querySelector(".graph__details")!, view.el.querySelector(".graph__all")!);
  body.append(side);
  app = h("div.zmc.zmc--graph-document", null, view.el);
  root.append(h("style", { text: STYLES + MAIN_STYLES }), app);
  theme(); dark.addEventListener("change", theme);
  view.refresh();
  function dispose() {
    if (disposed) return;
    disposed = true; view?.dispose(); dark.removeEventListener("change", theme); clear(root);
  }
  return { id: tab.id as string, dispose };
}
