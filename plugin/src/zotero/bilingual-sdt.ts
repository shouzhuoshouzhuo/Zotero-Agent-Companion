/**
 * Zotero 10 SDT integration, informed by Z-Transplit's sdtBridge/lazyQueue design.
 * Reference: https://github.com/Liozhang/z-transplit/tree/fe0e39f234da1c16eb97a77be9806755748834f5/src/core/pdf/sdt
 * This implementation uses native reading mode; it never rewrites the source PDF.
 */
const TAGS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "FIGCAPTION", "ASIDE", "LI"]);
export interface ReadingBlock { id: string; text: string; original: HTMLElement }
export const unwrapReader = (r: any): any => r?.wrappedJSObject ?? r;

export function collectReadingBlocks(container: HTMLElement): ReadingBlock[] {
  const result: ReadingBlock[] = [];
  const ids = new Set<string>();
  for (const el of Array.from(container.querySelectorAll<HTMLElement>("[data-ref-path]"))) {
    const id = el.dataset.refPath;
    if (!id || ids.has(id) || !TAGS.has(el.tagName) || el.closest(".sdt-reference,.zmc-bi-slot,table")) continue;
    // A list item containing its own paragraph must not be translated twice.
    if (el.tagName === "LI" && el.querySelector("p[data-ref-path]")) continue;
    const text = (el.innerText || el.textContent || "").replace(/[ \t\u00a0]+/g, " ").trim();
    if (text.length < 2) continue;
    ids.add(id); result.push({ id, text, original: el });
  }
  return result;
}

/** Exactly the iframe viewport; no prefetch or look-ahead margin. */
export function intersectsViewport(rect: { top: number; bottom: number; left: number; right: number; width: number; height: number }, width: number, height: number) {
  return width > 0 && height > 0 && rect.width > 0 && rect.height > 0
    && rect.top < height && rect.bottom > 0 && rect.left < width && rect.right > 0;
}

/** A long paragraph is translated in bounded pieces without silently dropping its tail. */
export function splitTranslationText(text: string, cap = 6000): string[] {
  if (!Number.isInteger(cap) || cap < 1) throw new Error("Invalid translation chunk size");
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > cap) {
    let at = rest.lastIndexOf(" ", cap);
    if (at < cap / 2) at = cap;
    // Avoid splitting a surrogate pair.
    const c = rest.charCodeAt(at - 1); if (c >= 0xD800 && c <= 0xDBFF && at > 1) --at;
    parts.push(rest.slice(0, at)); rest = rest.slice(at).trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}

export async function enterReadingView(reader: any, alive: () => boolean) {
  await reader._initPromise;
  const raw = unwrapReader(reader._internalReader);
  if (typeof raw?._setReadingMode !== "function") throw new Error("当前 Zotero 不支持结构化阅读模式，需要 Zotero 10。");
  const owned = !raw._primarySDTView;
  // Both parameters are required: (primary, enabled). Content objects need to be unwrapped.
  await raw._setReadingMode(true, true);
  const view = unwrapReader(raw._primarySDTView);
  if (!view) throw new Error("无法进入阅读模式；此 PDF 可能暂不支持结构化文本。");
  const exit = async () => {
    if (owned && unwrapReader(raw._primarySDTView) === view) await raw._setReadingMode(true, false);
  };
  try {
    const end = Date.now() + 20000;
    while (alive() && Date.now() < end) {
      const doc: Document | undefined = view._iframe?.contentDocument;
      const container = doc?.getElementById("sdt-content");
      if (doc && container && collectReadingBlocks(container).length) return { doc, container, view, raw, exit };
      await new Promise(resolve => (reader._window || Zotero.getMainWindow()).setTimeout(resolve, 100));
    }
    throw new Error(alive() ? "阅读模式未生成可翻译的段落；扫描件需要先完成文字识别。" : "双语阅读已取消");
  } catch (e) { await exit(); throw e; }
}
