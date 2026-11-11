import { isWikiFilename, parseWikiDocument, type WikiDocument } from "../wiki-document.ts";

interface OpenTab { id: string; dispose(): void }
/** Intercept only our data documents; ordinary PDF/file handlers retain their original receiver and args. */
export function installGraphDocuments(mount: (win: any, item: any, doc: WikiDocument, closed: () => void) => OpenTab) {
  const tabs = new Map<any, Map<number, OpenTab>>();
  const pending = new Map<string, Promise<boolean>>();
  const titleHooks = new Map<any, { hooks: any; previous: any; own: any }>();
  function removeTitleHook(win: any) {
    const entry = titleHooks.get(win);
    if (entry && entry.hooks.zmcwikigraph === entry.own) {
      if (entry.previous) entry.hooks.zmcwikigraph = entry.previous;
      else delete entry.hooks.zmcwikigraph;
    }
    titleHooks.delete(win);
  }
  let stopped = false;
  const original = Zotero.FileHandlers.open;
  async function open(item: any, owner?: any): Promise<boolean> {
    const win = owner?.Zotero_Tabs ? owner : Zotero.getMainWindow();
    if (!win || stopped) return false;
    const current = tabs.get(win)?.get(item.id);
    if (current) { win.Zotero_Tabs.select(current.id); return true; }
    const key = `${win.Zotero_Tabs.windowID}:${item.id}`;
    if (pending.has(key)) return pending.get(key)!;
    const task = (async () => {
      const path = await item.getFilePathAsync();
      if (!path) throw new Error("连接图附件不在本机，请先下载附件");
      if ((await IOUtils.stat(path)).size > 16_384) throw new Error("连接图文件过大");
      const doc = parseWikiDocument(await IOUtils.readUTF8(path));
      if (stopped || win.closed) return false;
      const col = Zotero.Collections.getByLibraryAndKey(item.libraryID, doc.collectionKey);
      if (!col || col.deleted) throw new Error("连接图对应的集合已不存在");
      let own = tabs.get(win);
      if (!own) { own = new Map(); tabs.set(win, own); }
      // Native item notifications refresh titles even for custom tabs.
      const hooks = win.Zotero_Tabs.tabHooks?.getTitle;
      if (hooks && !titleHooks.has(win)) {
        const getTitle = async (tab: any) => tab.data.graphTitle || "知识连接图";
        titleHooks.set(win, { hooks, previous: hooks.zmcwikigraph, own: getTitle });
        hooks.zmcwikigraph = getTitle;
      }
      const tab = mount(win, item, doc, () => { own!.delete(item.id); });
      own.set(item.id, tab);
      return true;
    })().finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  }
  const wrapped = async function (this: unknown, item: any, params?: any) {
    if (!stopped && item?.isAttachment?.() && isWikiFilename(item.attachmentFilename)) {
      try { return await open(item, params?.window); }
      catch (e) { Zotero.logError(e); (params?.window ?? Zotero.getMainWindow())?.alert(`无法打开知识连接图：${(e as Error).message}`); return false; }
    }
    return original.apply(this, arguments as any);
  };
  Zotero.FileHandlers.open = wrapped;
  return {
    open,
    closeWindow(win: any) { for (const tab of tabs.get(win)?.values() ?? []) tab.dispose(); tabs.delete(win); removeTitleHook(win); },
    dispose() {
      stopped = true;
      if (Zotero.FileHandlers.open === wrapped) Zotero.FileHandlers.open = original;
      for (const [win, own] of tabs) for (const tab of [...own.values()]) {
        tab.dispose();
        try { win.Zotero_Tabs.close(tab.id); } catch { /* a closing window */ }
      }
      tabs.clear();
      for (const win of [...titleHooks.keys()]) removeTitleHook(win);
    },
  };
}
