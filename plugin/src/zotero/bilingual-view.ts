import { collectReadingBlocks, intersectsViewport, type ReadingBlock } from "./bilingual-sdt.ts";
import type { ParagraphJob } from "./bilingual-queue.ts";

const CSS = `
.zmc-bi-slot { --zmc-translation-ink:light-dark(#17538a,#9bcaff); --zmc-translation-bg:light-dark(#f0f6fc,#192b3d); margin:.4em 0 1.35em; padding:.6em .85em .7em; border-inline-start:3px solid light-dark(#729bc4,#668fb8); border-radius:0 5px 5px 0; background:var(--zmc-translation-bg); font-family:"PingFang SC","Noto Sans CJK SC",sans-serif; font-size:.94em; font-weight:400; line-height:1.85; color:var(--zmc-translation-ink); white-space:pre-wrap; overflow-wrap:anywhere; user-select:text; }
.zmc-bi-slot[data-state="waiting"] { display:none; }
.zmc-bi-slot[data-state="loading"] { opacity:.75; }
.zmc-bi-note { display:block; font:12px/1.5 sans-serif; font-weight:500; margin-bottom:.35em; }
.zmc-bi-tools { display:flex; align-items:center; flex-wrap:wrap; gap:5px; margin-bottom:.3em; }
.zmc-bi-tools .zmc-bi-note { margin:0; margin-inline-end:auto; }
.zmc-bi-slot [hidden] { display:none !important; }
.zmc-bi-slot[data-collapsed="true"] { padding-block:.4em; }
.zmc-bi-slot button { font:inherit; color:inherit; background:transparent; border:1px solid currentColor; border-radius:4px; padding:.15em .6em; cursor:pointer; margin-inline-start:.5em; }
.zmc-bi-slot button:focus-visible { outline:2px solid currentColor; outline-offset:3px; }
.zmc-bi-linked { background:color-mix(in srgb,currentColor 9%,transparent); outline:1px solid color-mix(in srgb,currentColor 18%,transparent); outline-offset:3px; border-radius:3px; }
@media print { .zmc-bi-slot { break-inside:avoid; } }
`;

export function createBilingualView(doc: Document, initial: HTMLElement, retry: (id: string, force?: boolean) => void, layoutChanged: () => void = () => {}) {
  const style = doc.createElement("style"); style.textContent = CSS; style.id = "zmc-bilingual-style"; doc.head.append(style);
  const slots = new Map<string, { block: ReadingBlock; el: HTMLElement; body: HTMLElement; note: HTMLElement; refresh: HTMLButtonElement; fold: HTMLButtonElement }>();
  const folded = new Set<string>();
  const connected = (node: Node) => { try { return node.isConnected; } catch { return false; } };
  let container = initial;
  let linked: HTMLElement[] = [];
  const clearLinked = () => { for (const el of linked) if (connected(el)) el.classList.remove("zmc-bi-linked"); linked = []; };
  const select = () => {
    clearLinked();
    const selection = doc.defaultView?.getSelection();
    if (!selection || selection.isCollapsed) return;
    const node = selection.anchorNode;
    const anchor = node?.nodeType === 1 ? node as Element : node?.parentElement;
    for (const slot of slots.values()) {
      if (anchor && (slot.block.original.contains(anchor) || slot.el.contains(anchor))) {
        linked = [slot.block.original, slot.el];
        for (const el of linked) el.classList.add("zmc-bi-linked"); break;
      }
    }
  };
  doc.addEventListener("selectionchange", select);
  return {
    discover(): ReadingBlock[] {
      const fresh = doc.getElementById("sdt-content");
      if (fresh) container = fresh;
      const additions: ReadingBlock[] = [];
      for (const block of collectReadingBlocks(container)) {
        const old = slots.get(block.id);
        if (old?.block.original === block.original && old.block.text === block.text && old.el.isConnected) continue;
        old?.el.remove();
        const el = doc.createElement("div"); el.className = "zmc-bi-slot";
        el.dataset.state = "waiting";
        // Not data-ref-path: the native PDF annotation mapper must not treat translated text as source text.
        el.dataset.zmcSource = block.id; el.setAttribute("role", "region"); el.setAttribute("aria-label", "段落译文");
        const note = doc.createElement("span"); note.className = "zmc-bi-note";
        const body = doc.createElement("div"); body.className = "zmc-bi-text";
        const tools = doc.createElement("div"); tools.className = "zmc-bi-tools";
        const refresh = doc.createElement("button"); refresh.type = "button"; refresh.textContent = "重新翻译";
        refresh.title = "再次调用翻译模型，成功后更新本地缓存";
        refresh.addEventListener("click", () => retry(block.id, true));
        const fold = doc.createElement("button"); fold.type = "button";
        const updateFold = () => {
          const collapsed = folded.has(block.id); body.hidden = collapsed;
          el.dataset.collapsed = String(collapsed); fold.textContent = collapsed ? "展开译文" : "收起译文";
          fold.setAttribute("aria-expanded", String(!collapsed));
        };
        fold.addEventListener("click", () => { if (folded.has(block.id)) folded.delete(block.id); else folded.add(block.id); updateFold(); layoutChanged(); });
        updateFold(); tools.append(note, refresh, fold); el.append(tools, body); block.original.after(el);
        slots.set(block.id, { block, el, body, note, refresh, fold }); additions.push(block);
      }
      for (const [id, slot] of slots) if (!slot.block.original.isConnected) { slot.el.remove(); slots.delete(id); }
      if (additions.length) layoutChanged();
      return additions;
    },
    visible(id: string) {
      const slot = slots.get(id); const win = doc.defaultView;
      if (!slot || !win || !connected(slot.block.original)) return false;
      return intersectsViewport(slot.block.original.getBoundingClientRect(), win.innerWidth, win.innerHeight)
        || intersectsViewport(slot.el.getBoundingClientRect(), win.innerWidth, win.innerHeight);
    },
    render(job: ParagraphJob) {
      const slot = slots.get(job.id); if (!slot || slot.block.text !== job.text || !connected(slot.el)) return;
      slot.el.dataset.state = job.status;
      slot.el.setAttribute("aria-busy", String(job.status === "loading"));
      slot.body.textContent = job.result;
      slot.refresh.hidden = job.status === "waiting" || job.status === "loading";
      slot.fold.hidden = !job.result;
      slot.note.replaceChildren();
      if (job.status === "loading") slot.note.textContent = "正在翻译…";
      else if (job.status === "done") slot.note.textContent = job.cached ? "译文 · 本地缓存" : "译文 · 已保存到本地";
      else if (job.status === "error") {
        slot.note.textContent = job.error + (job.result ? "（译文尚未缓存）" : "");
        slot.refresh.textContent = "重试翻译";
      }
      if (job.status !== "error") slot.refresh.textContent = "重新翻译";
      layoutChanged();
    },
    connected: () => connected(container),
    dispose() {
      // Closing reading mode destroys the content realm. Chrome must release it without touching dead wrappers.
      if (connected(container)) doc.removeEventListener("selectionchange", select);
      clearLinked();
      for (const slot of slots.values()) if (connected(slot.el)) slot.el.remove();
      slots.clear(); if (connected(style)) style.remove();
      if (connected(container)) layoutChanged();
    },
  };
}
