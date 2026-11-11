/** Validated local teaching material. PDF pages are one-based, coordinates are never supplied by the model. */
import { graphLink } from "../ui/graph-model.ts";
export interface LessonPoint { id: string; page: number; quote: string; title: string; explanation: string; links: { label: string; uri: string }[] }
export interface Lesson {
  version: 1; fingerprint: string; status: "preparing" | "ready"; title: string;
  coverage: { start: number; end: number; mode: "text" | "image" }[];
  unresolved: string[]; points: LessonPoint[];
}
const str = (v: unknown, cap: number) => { if (typeof v !== "string" || v.length > cap) throw new Error("备课文件包含无效文本"); return v; };
export function parseLesson(value: unknown, fingerprint: string, pages: number): Lesson {
  const v = value as any;
  if (!v || v.version !== 1 || v.fingerprint !== fingerprint || !["preparing", "ready"].includes(v.status)) throw new Error("备课文件不匹配当前 PDF，或格式无效");
  if (!Array.isArray(v.points) || v.points.length > 1000 || !Array.isArray(v.coverage) || !Array.isArray(v.unresolved)) throw new Error("备课文件缺少重点、覆盖范围或待核查项");
  const ids = new Set();
  const points: LessonPoint[] = v.points.map((p: any) => {
    const id = str(p.id, 100); if (!id || ids.has(id)) throw new Error("教学重点标识重复或为空"); ids.add(id);
    if (!Number.isInteger(p.page) || p.page < 1 || p.page > pages) throw new Error("教学重点页码越界");
    const quote = str(p.quote, 2000); if (quote.trim().length < 12) throw new Error("教学引句过短，无法可靠定位");
    if (!Array.isArray(p.links) || p.links.length > 20) throw new Error("教学链接格式无效");
    return { id, page: p.page, quote, title: str(p.title, 200), explanation: str(p.explanation, 16000), links: p.links.map((l: any) => {
      const uri = str(l.uri, 2000); if (!graphLink(uri)) throw new Error("教学链接只接受有效的 Zotero 定位链接");
      return { label: str(l.label, 200), uri };
    }) };
  });
  const covered = new Set<number>();
  const coverage = v.coverage.map((r: any) => {
    if (!Number.isInteger(r.start) || !Number.isInteger(r.end) || r.start < 1 || r.end < r.start || r.end > pages || !["text", "image"].includes(r.mode)) throw new Error("阅读范围无效");
    for (let i = r.start; i <= r.end; i++) covered.add(i);
    return { start: r.start, end: r.end, mode: r.mode };
  });
  if (v.status === "ready" && (covered.size !== pages || !points.length)) throw new Error("备课尚未覆盖全部 PDF 页，不能进入教学");
  return { version: 1, fingerprint, status: v.status, title: str(v.title, 500), coverage, unresolved: v.unresolved.map((s: unknown) => str(s, 2000)), points };
}

export interface Glyph { u?: string; c?: string; spaceAfter?: boolean; lineBreakAfter?: boolean; rect: number[] }
function normalized(text: string) { return text.normalize("NFKC").toLowerCase().replace(/[\s\-\u00ad]+/g, ""); }
/** Exact normalized match, unique on the specified page; ambiguous matches never place a highlight. */
export function locateQuote(chars: Glyph[], quote: string): number[][] | null {
  let text = ""; const owners: number[] = [];
  chars.forEach((ch, index) => { const s = normalized(ch.u ?? ch.c ?? ""); text += s; for (let i = 0; i < s.length; i++) owners.push(index); });
  const q = normalized(quote), at = text.indexOf(q);
  if (!q || at < 0 || text.indexOf(q, at + 1) >= 0) return null;
  const start = owners[at]!, end = owners[at + q.length - 1]!;
  const rects: number[][] = []; let line: number[] | undefined;
  for (let i = start; i <= end; i++) {
    const c = chars[i]!, r = c.rect;
    if (!r || r.length !== 4 || !r.every(Number.isFinite)) return null;
    if (!line) line = [...r]; else { line[0] = Math.min(line[0]!, r[0]!); line[1] = Math.min(line[1]!, r[1]!); line[2] = Math.max(line[2]!, r[2]!); line[3] = Math.max(line[3]!, r[3]!); }
    if (c.lineBreakAfter || i === end) { rects.push(line); line = undefined; }
  }
  return rects;
}

/** Keep cards in source order, avoid overlap. Offscreen cards remain out of view instead of stacking on screen edges. */
export function placeCards(items: { id: string; top: number; height: number; side: string }[], gap = 12) {
  const bottom = new Map<string, number>();
  return [...items].sort((a, b) => a.top - b.top).map(item => {
    const top = Math.max(item.top, bottom.get(item.side) ?? -Infinity);
    bottom.set(item.side, top + item.height + gap); return { ...item, top };
  });
}
