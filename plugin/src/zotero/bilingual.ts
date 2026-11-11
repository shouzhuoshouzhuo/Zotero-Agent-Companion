import type { BackendId, Catalog, PanelSettings } from "../types.ts";
import { createRuntime, translatorPrompt } from "../agent/index.ts";
import { language } from "../ui/settings-model.ts";
import { createTranslator } from "./translate.ts";
import { prefs } from "./settings.ts";
import { withDefaults } from "./defaults.ts";
import { createGeckoSpawner } from "./spawn-gecko.ts";
import * as keychain from "./keychain.ts";
import { createParagraphCache, type ParagraphCache } from "./bilingual-cache.ts";
import { createParagraphQueue, ParagraphInterrupted } from "./bilingual-queue.ts";
import { createBilingualView } from "./bilingual-view.ts";
import { createReadingLayout } from "./bilingual-layout.ts";
import { enterReadingView, splitTranslationText, unwrapReader } from "./bilingual-sdt.ts";

type Live = {
  reader: any; model: string; language: string; timer: number; timerWin: any;
  queue: ReturnType<typeof createParagraphQueue>;
  view: ReturnType<typeof createBilingualView>;
  reading: Awaited<ReturnType<typeof enterReadingView>>;
  translator: ReturnType<typeof createTranslator>;
  layout: ReturnType<typeof createReadingLayout>;
};

/** One active reader at a time; no work for background tabs and no background process after exit. */
export function createBilingual(o: { dataDir: string; known(b: BackendId): Catalog | undefined }) {
  let live: Live | null = null, starting: any = null;
  let generation = 0, disposed = false, message = "只翻译视口内的段落，成功译文持久保存在本机。";
  const controls = new Map<HTMLElement, { reader: any; toggle: HTMLButtonElement; pause: HTMLButtonElement; status: HTMLElement }>();
  const caches = new Map<string, ParagraphCache>();
  const attached = (root: HTMLElement) => { try { return root.isConnected; } catch { return false; } };
  const readSettings = () => withDefaults(prefs.json("settings", {}), Zotero.locale);
  const modelFor = (s: PanelSettings) => s.translateModel[s.backend] || (s.backend === "codex" ? "gpt-6-luna" : "");
  const fingerprint = (s: PanelSettings) => JSON.stringify([s.backend, s.auth[s.backend], modelFor(s), s.translateTo]);
  function paint(ui: { reader: any; toggle: HTMLButtonElement; pause: HTMLButtonElement; status: HTMLElement }) {
      const current = live?.reader === ui.reader;
      ui.toggle.textContent = starting === ui.reader ? "取消准备" : current ? "退出双语" : "开启逐段双语";
      ui.toggle.setAttribute("aria-pressed", String(!!current));
      ui.pause.hidden = !current;
      ui.pause.textContent = live?.queue.stats().paused ? "继续翻译" : "暂停翻译";
      const stats = current ? live!.queue.stats() : null;
      ui.status.textContent = stats
        ? `已保存 ${stats.done}/${stats.total} 段 · 缓存命中 ${stats.cached} 段 · ${language(live!.language).label} · ${live!.model}${stats.failed ? ` · 失败 ${stats.failed} 段（点击段落重试）` : ""}${stats.paused ? " · 已暂停" : ""}`
        : starting === ui.reader ? "正在准备阅读模式，尚未发送论文内容…" : message;
  }
  function publish() {
    for (const [root, ui] of controls) {
      if (!attached(root)) { controls.delete(root); continue; }
      paint(ui);
    }
  }
  async function close(exitReading: boolean) {
    const old = live; live = null;
    if (!old) return;
    old.timerWin.clearInterval(old.timer); old.queue.stop();
    try { old.view.dispose(); } catch (e) { Zotero.logError(e); }
    try { if (old.view.connected()) old.layout.flush(); } catch (e) { Zotero.logError(e); }
    old.layout.dispose();
    const closing = old.translator.dispose();
    if (exitReading) await old.reading.exit().catch(e => Zotero.logError(e));
    await closing.catch(e => Zotero.logError(e));
  }
  async function start(reader: any) {
    if (disposed || starting) return;
    const token = ++generation;
    starting = reader; publish();
    let reading: Awaited<ReturnType<typeof enterReadingView>> | undefined;
    let translator: ReturnType<typeof createTranslator> | undefined;
    try {
      await close(true);
      const settings = readSettings();
      if (settings.backend === "custom") throw new Error("双语阅读需要内置翻译智能体，请在设置中选择 Codex。");
      const model = modelFor(settings);
      if (!model) throw new Error("请先在设置 → 翻译中指定翻译模型。");
      const snapshot: PanelSettings = { ...settings, translate: true, translateModel: { ...settings.translateModel, [settings.backend]: model } };
      const unchanged = () => fingerprint(readSettings()) === fingerprint(snapshot);
      const alive = () => !disposed && token === generation;
      reading = await enterReadingView(reader, alive);
      if (!alive()) { await reading.exit(); return; }
      const win = reader._window || Zotero.getMainWindow();
      const item = Zotero.Items.get(reader.itemID);
      if (!item?.key || !/^[A-Za-z0-9_-]+$/.test(item.key)) throw new Error("无法确定当前 PDF 的缓存标识。");
      const dir = PathUtils.join(o.dataDir, "bilingual-cache");
      const path = PathUtils.join(dir, `${Number(item.libraryID)}-${item.key}.json`);
      let cache = caches.get(path);
      if (!cache) {
        cache = createParagraphCache(path, {
          exists: p => IOUtils.exists(p), read: p => IOUtils.readUTF8(p),
          async write(p, data) {
            await IOUtils.makeDirectory(dir, { createAncestors: true, ignoreExisting: true });
            await IOUtils.writeUTF8(p, data, { tmpPath: p + ".tmp" });
          },
        });
        caches.set(path, cache);
      }
      translator = createTranslator({
        runtime: createRuntime({ spawner: createGeckoSpawner(), bridgeDir: PathUtils.join(o.dataDir, "bridges") }),
        settings: () => snapshot, strictModel: true, known: o.known,
        async cwd() { const p = PathUtils.join(o.dataDir, "bilingual-translate"); await IOUtils.makeDirectory(p, { createAncestors: true, ignoreExisting: true }); return p; },
        async env(s) { const name = keychain.API_KEY_ENV[s.backend]; const key = s.auth[s.backend] === "api-key" && name ? await keychain.getApiKey(s.backend) : null; return key ? { [name!]: key } : {}; },
      });
      const engine = translator;
      if (typeof reading.view._handleViewUpdate !== "function") throw new Error("当前阅读器缺少注释布局刷新接口，请更新 Zotero。");
      const layout = createReadingLayout(reading.view, win);
      const view = createBilingualView(reading.doc, reading.container, (id, force) => queue.retry(id, force), () => layout.changed());
      const activeTab = () => {
        try { return !win.closed && !win.document.hidden && (!reader.tabID || win.Zotero_Tabs?.selectedID === reader.tabID); }
        catch { return false; }
      };
      const identity = { backend: `${snapshot.backend}/${snapshot.auth[snapshot.backend]}`, model, language: snapshot.translateTo,
        prompt: translatorPrompt(language(snapshot.translateTo).name) };
      const queue = createParagraphQueue({
        cache, identity, active: () => alive() && activeTab() && view.connected() && unchanged(), visible: id => view.visible(id),
        async translate(text, onText, canContinue) {
          const chunks = splitTranslationText(text);
          for (let i = 0; i < chunks.length; ++i) {
            if (!alive() || !activeTab() || !unchanged() || !canContinue()) throw new ParagraphInterrupted("翻译已暂停");
            if (i) onText("\n");
            await engine.translate({ text: chunks[i]!, to: snapshot.translateTo, onText });
          }
        },
        cancel: () => engine.cancel(), onChange: job => view.render(job), onProgress: publish,
      });
      const poll = () => {
        if (!alive()) return;
        if (!view.connected() || unwrapReader(reading!.raw._primarySDTView) !== reading!.view) {
          ++generation; void close(false).then(publish); return;
        }
        if (!unchanged()) { ++generation; message = "翻译设置已变化，请重新开启双语阅读；已有缓存仍保留。"; void close(false).then(publish); return; }
        for (const block of view.discover()) queue.add(block.id, block.text);
        layout.flush();
        void queue.tick();
      };
      const timer = win.setInterval(poll, 500);
      live = { reader, model, language: snapshot.translateTo, timer, timerWin: win, queue, view, reading, translator, layout };
      starting = null; poll(); publish();
    } catch (e) {
      await translator?.dispose().catch(err => Zotero.logError(err));
      await reading?.exit().catch(err => Zotero.logError(err));
      if (token === generation) message = `无法开启双语阅读：${e instanceof Error ? e.message : String(e)}`;
    } finally { if (starting === reader) starting = null; publish(); }
  }
  const toggle = async (reader: any) => {
    if (starting) { ++generation; message = "已取消准备，正在恢复阅读视图…"; publish(); return; }
    if (live?.reader === reader) { ++generation; await close(true); message = "已退出双语阅读，译文缓存已保留。"; publish(); return; }
    await start(reader);
  };
  return {
    toggle,
    status: () => live ? { active: true, ...live.queue.stats(), model: live.model, sessionsStarted: live.translator.stats().started } : { active: false },
    controls(doc: Document, reader: any): HTMLElement {
      const root = doc.createElementNS("http://www.w3.org/1999/xhtml", "div") as HTMLElement;
      root.className = "zmc-bilingual-controls";
      root.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;padding:10px 0 14px;margin-bottom:8px;border-bottom:1px solid var(--fill-quinary);";
      const title = doc.createElementNS("http://www.w3.org/1999/xhtml", "strong"); title.textContent = "段落双语阅读"; title.style.width = "100%";
      const button = (text: string) => { const b = doc.createElementNS("http://www.w3.org/1999/xhtml", "button") as HTMLButtonElement; b.type = "button"; b.textContent = text; b.style.cssText = "font:inherit;padding:4px 9px;cursor:pointer;"; return b; };
      const enable = button("开启逐段双语"); enable.addEventListener("click", () => void toggle(reader));
      const pause = button("暂停翻译"); pause.hidden = true;
      pause.addEventListener("click", () => { const current = live; if (current && current.reader === reader) { current.queue.pause(!current.queue.stats().paused); publish(); } });
      const status = doc.createElementNS("http://www.w3.org/1999/xhtml", "span") as HTMLElement;
      status.style.cssText = "width:100%;font-size:12px;line-height:1.6;color:var(--fill-secondary);"; status.setAttribute("role", "status"); status.textContent = message;
      root.append(title, enable, pause, status);
      const ui = { reader, toggle: enable, pause, status }; controls.set(root, ui); paint(ui);
      // Attached by the caller immediately afterwards. Updating connected controls happens on each queue/status change.
      return root;
    },
    async dispose() { disposed = true; ++generation; await close(true); for (const root of controls.keys()) if (attached(root)) root.remove(); controls.clear(); },
  };
}
