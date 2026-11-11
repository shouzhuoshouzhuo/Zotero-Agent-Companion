// Read-only native Zotero adapter. Nothing is sent to a model or written to library items.
import type { PanelHost, WikiGraphData } from "../types.ts";
import { buildGraph, graphLink, type GraphRecord } from "../ui/graph-model.ts";
import { t } from "../i18n.ts";
import { isWikiFilename } from "../wiki-document.ts";

const LIMIT = 200;
const scopeOf = (id: number): string => id === Zotero.Libraries.userLibraryID ? "library" : `groups/${Zotero.Libraries.get(id).groupID}`;
const idOf = (item: any): string => `${scopeOf(item.libraryID)}:${item.key}`;

export function createWikiGraph(win: any, fixedLibraryID?: number): NonNullable<PanelHost["wikiGraph"]> {
  const libraryID = () => fixedLibraryID ?? win.ZoteroPane.getSelectedLibraryID?.() ?? Zotero.Libraries.userLibraryID;
  const libFor = (scope: string) => scope === "library" ? Zotero.Libraries.userLibraryID : Zotero.Groups.getLibraryIDFromGroupID(Number(scope.slice(7)));
  return {
    async scopes() {
      const lib = libraryID();
      const all = Zotero.Collections.getByLibrary(lib, true).filter((c: any) => !c.deleted);
      const name = (c: any, seen = new Set<number>()): string => {
        if (!c.parentID || seen.has(c.id)) return c.name;
        seen.add(c.id);
        const parent = all.find((p: any) => p.id === c.parentID);
        return parent ? `${name(parent, seen)} / ${c.name}` : c.name;
      };
      const selected = win.ZoteroPane.getSelectedCollection?.();
      const preferred = selected ?? all.find((c: any) => /agent security/i.test(c.name));
      const base = `lib:${lib}`;
      return { scopes: [{ id: base, name: t("graph.library") }, ...all.map((c: any) => ({ id: `${base}:${c.key}`, name: name(c) }))], current: preferred ? `${base}:${preferred.key}` : base };
    },
    async read(scope): Promise<WikiGraphData> {
      const m = /^lib:(\d+)(?::([A-Z0-9]{8}))?$/.exec(scope);
      if (!m) throw new Error(t("graph.badScope"));
      const lib = Number(m[1]);
      const s = new Zotero.Search();
      s.libraryID = lib;
      s.addCondition("itemType", "isNot", "annotation");
      // Search IDs first; only bounded records/notes are loaded below.
      let seedIDs: number[] = m[2] ? [] : await s.search();
      if (m[2]) {
        const collections = Zotero.Collections.getByLibrary(lib, true).filter((c: any) => !c.deleted);
        const root = collections.find((c: any) => c.key === m[2]);
        if (!root) throw new Error(t("graph.badScope"));
        const wanted = new Set<number>([root.id]);
        for (let i = 0; i < collections.length; i++) for (const c of collections) if (wanted.has(c.parentID)) wanted.add(c.id);
        const direct = new Set<number>();
        for (const c of collections.filter((c: any) => wanted.has(c.id))) {
          await c.loadDataType("childItems");
          for (const id of c.getChildItems(true, false)) direct.add(id);
        }
        seedIDs = [...direct];
      }
      const records = new Map<string, GraphRecord>();
      let truncated = seedIDs.length > LIMIT;
      // Parents are checked too: a child of a trashed item is not a live graph node.
      const live = (it: any) => it && !it.deleted && !it.isAnnotation() && !(it.isAttachment() && isWikiFilename(it.attachmentFilename));
      async function record(it: any, external = false): Promise<GraphRecord | null> {
        if (!live(it)) return null;
        if (it.parentID && (await Zotero.Items.getAsync(it.parentID))?.deleted) return null;
        const id = idOf(it);
        if (records.has(id)) return records.get(id)!;
        if (records.size >= LIMIT) { truncated = true; return null; }
        await Zotero.Items.loadDataTypes([it], ["itemData", "note", "relations"]);
        const kind = it.isNote() ? "note" : it.isAttachment() ? "attachment" : "paper";
        const uri = `zotero://${kind === "attachment" ? "open-pdf" : "select"}/${scopeOf(it.libraryID)}/items/${it.key}`;
        let links: string[] = [];
        if (kind === "note") {
          const doc = new win.DOMParser().parseFromString(it.getNote(), "text/html");
          links = Array.from<Element>(doc.querySelectorAll("a[href]")).map((a) => a.getAttribute("href") ?? "").filter((u) => !!graphLink(u));
        }
        const r: GraphRecord = { id, title: it.getDisplayTitle() || it.key, kind, uri, links, ...(external ? { external } : {}), ...(it.parentKey ? { parent: `${scopeOf(it.libraryID)}:${it.parentKey}` } : {}), related: (it.relatedItems ?? []).map((key: string) => `${scopeOf(it.libraryID)}:${key}`) };
        records.set(id, r);
        return r;
      }
      const seeds = await Zotero.Items.getAsync(seedIDs.slice(0, LIMIT));
      for (const it of seeds) await record(it);
      // Collection membership belongs to top-level items, so explicitly include their child notes.
      for (const it of seeds) {
        if (!live(it) || it.isNote() || it.isAttachment()) continue;
        await it.loadDataType("childItems");
        const childIDs = [...it.getNotes(), ...it.getAttachments()];
        if (childIDs.length > LIMIT - records.size) truncated = true;
        const children = await Zotero.Items.getAsync(childIDs.slice(0, Math.max(0, LIMIT - records.size)));
        for (const child of children) await record(child);
      }
      const base = [...records.values()];
      // Only one hop outside scope, never recursively crawl an unrelated library.
      for (const r of base) for (const href of r.links) {
        const target = graphLink(href)!;
        if (records.has(target.id)) continue;
        if (records.size >= LIMIT) { truncated = true; break; }
        try {
          const targetLib = libFor(target.scope);
          if (!targetLib) continue;
          const item = await Zotero.Items.getByLibraryAndKeyAsync(targetLib, target.key);
          await record(item, true);
        } catch { /* inaccessible/missing links are counted by buildGraph */ }
      }
      return buildGraph([...records.values()], truncated);
    },
    onChange(cb) {
      const id = Zotero.Notifier.registerObserver({ notify: () => cb() }, ["item", "collection", "collection-item"], "zotero-agent-graph");
      return () => Zotero.Notifier.unregisterObserver(id);
    },
  };
}
