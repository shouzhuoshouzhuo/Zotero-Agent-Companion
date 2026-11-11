import type { TranslateRequest } from "./translate.ts";
import { LANGUAGES } from "../ui/settings-model.ts";

export function translationLanguageID(id: string): string {
  const aliases: Record<string, string> = { "zh-CN": "zh-Hans", "zh-TW": "zh-Hant", "zh-HK": "zh-Hant", "zh-SG": "zh-Hans" };
  const canonical = aliases[id] ?? id;
  if (!LANGUAGES.some(l => l.id === canonical)) throw new Error(`不支持的翻译目标语言：${id}`);
  return canonical;
}

const XHTML = "http://www.w3.org/1999/xhtml";
const RESOURCE = "zmc-translation-sidebar.ftl";
type RecordState = { source: string; text: string; to: string; status: string; error: string; generation: number };

/** Translation belongs to its reader tab, not to the short-lived selection popup or chat. */
export function createTranslationSidebar(o: {
  id: string; rootURI: string;
  translate(req: TranslateRequest): Promise<void>;
  cancel(): void;
  language(): string;
  bilingualControls?(doc: Document, reader: any): HTMLElement;
}) {
  const records = new Map<string, RecordState>();
  const views = new Map<HTMLElement, string>();
  let active: RecordState | null = null;
  let generation = 0;
  let disposed = false;
  const label = /^zh/i.test(Zotero.locale) ? "翻译" : "Translation";
  const keyFor = (reader: any) => String(reader.tabID || `reader-${reader.itemID}`);
  const paneID = Zotero.ItemPaneManager.registerSection({
    paneID: "translation-sidebar", pluginID: o.id,
    header: { l10nID: "zmc-translation-sidebar", icon: o.rootURI + "assets/translate.svg" },
    sidenav: { l10nID: "zmc-translation-sidebar-nav", icon: o.rootURI + "assets/translate.svg" },
    onInit: ({ doc, body }: any) => { doc.l10n.addResourceIds([RESOURCE]); render(body); },
    onRender: ({ body }: any) => render(body),
    onDestroy: ({ body }: any) => views.delete(body),
  });
  if (!paneID) throw new Error("Could not register the translation sidebar");

  function node(doc: Document, tag: string, text = "", cls = ""): HTMLElement {
    const el = doc.createElementNS(XHTML, tag) as HTMLElement;
    el.className = cls; el.textContent = text; return el;
  }
  function render(body: HTMLElement) {
    if (disposed) return;
    const doc = body.ownerDocument;
    const details = body.closest("item-details") as any;
    const reader = Zotero.Reader.getByTabID(details?.tabID);
    const key = reader ? keyFor(reader) : "library";
    views.set(body, key);
    const state = records.get(key);
    const root = node(doc, "div", "", "zmc-translation-sidebar");
    root.style.cssText = "display:flex;flex-direction:column;gap:12px;padding:8px 0;min-height:220px;font:13px/1.65 system-ui;color:var(--fill-primary);";
    root.setAttribute("role", "region"); root.setAttribute("aria-label", label);
    if (reader && o.bilingualControls) root.append(o.bilingualControls(doc, reader));
    if (!state) {
      const hint = node(doc, "p", "在 PDF 中选中文字，点击“翻译”，译文将在此显示。切换到其他段落后，当前结果仍会保留。");
      hint.style.color = "var(--fill-secondary)"; root.append(hint);
    } else {
      const controls = node(doc, "div"); controls.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap;";
      const lang = node(doc, "select") as HTMLSelectElement;
      lang.setAttribute("aria-label", "目标语言");
      for (const target of LANGUAGES) {
        const option = node(doc, "option", target.label) as HTMLOptionElement;
        option.value = target.id; lang.append(option);
      }
      lang.value = state.to;
      lang.addEventListener("change", () => void run(key, state.source, lang.value));
      controls.append(lang);
      const button = (text: string, click: () => void) => {
        const b = node(doc, "button", text) as HTMLButtonElement; b.type = "button";
        b.style.cssText = "font:inherit;padding:3px 8px;cursor:pointer;"; b.addEventListener("click", click); controls.append(b); return b;
      };
      const copy = button("复制译文", () => Zotero.Utilities.Internal.copyTextToClipboard(state.text));
      copy.disabled = !state.text;
      button(state.status === "loading" ? "停止" : "重新翻译", () => {
        if (state.status === "loading") { state.generation = ++generation; state.status = "stopped"; active = null; o.cancel(); refresh(); }
        else void run(key, state.source, state.to);
      });
      const original = node(doc, "details");
      original.append(node(doc, "summary", "原文"), node(doc, "div", state.source));
      original.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;";
      const status = node(doc, "div", state.error || (state.status === "loading" ? "正在翻译…" : state.status === "stopped" ? "翻译已停止，已保留收到的内容" : "翻译完成"), "zmc-translation-status");
      status.setAttribute("role", state.error ? "alert" : "status");
      status.style.cssText = "font-size:12px;color:var(--fill-secondary);";
      const text = node(doc, "div", state.text, "zmc-translation-output");
      text.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;line-height:1.85;max-height:65vh;overflow-y:auto;padding:12px;border:1px solid var(--fill-quinary);border-radius:8px;min-height:80px;";
      text.setAttribute("tabindex", "0");
      root.setAttribute("aria-busy", String(state.status === "loading"));
      if (state.source.length > 6000) root.append(node(doc, "p", "本次仅翻译前 6000 个字符，请分段选择更长文本。"));
      root.append(controls, original, status, text);
    }
    body.replaceChildren(root);
  }
  function refresh() {
    for (const body of views.keys()) {
      if (!body.isConnected) { views.delete(body); continue; }
      render(body);
    }
  }
  async function run(key: string, text: string, to: string) {
    if (disposed) return;
    if (active) { active.generation = ++generation; active.status = "stopped"; o.cancel(); }
    to = translationLanguageID(to);
    const token = ++generation;
    // Match the upstream translator's documented 6000-character limit.
    const source = text.trim();
    const state: RecordState = { source, text: "", to, status: "loading", error: "", generation: token };
    records.set(key, state); active = state; refresh();
    const current = () => !disposed && state.generation === token;
    try {
      await o.translate({ text: source.slice(0, 6000), to, onText(delta) {
        if (!current()) return;
        state.text += delta;
        // Update only text and state while streaming, preserving focus and scroll position.
        for (const [body, viewKey] of views) if (viewKey === key && body.isConnected) {
          const out = body.querySelector(".zmc-translation-output"); if (out) out.textContent = state.text;
        }
      } });
      if (current()) state.status = "done";
    } catch (e) {
      if (current()) { state.status = "error"; state.error = e instanceof Error ? e.message : String(e); }
    } finally {
      if (active === state) active = null;
      if (current()) refresh();
    }
  }
  return {
    paneID,
    show(event: any) {
      const reader = event.reader;
      void run(keyFor(reader), String(event.params.annotation.text), o.language());
      const win = reader._window || Zotero.getMainWindow();
      for (const details of win.document.querySelectorAll("item-details")) {
        if (details.tabID !== reader.tabID) continue;
        details.renderCustomSections();
        const section = details.getPane(paneID); if (section) section.open = true;
        void details.scrollToPane(paneID, "smooth");
      }
    },
    dispose() {
      disposed = true; ++generation; if (active) o.cancel();
      Zotero.ItemPaneManager.unregisterSection(paneID);
      views.clear(); records.clear();

    },
  };
}
