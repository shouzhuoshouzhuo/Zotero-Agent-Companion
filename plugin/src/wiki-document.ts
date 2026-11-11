/** A portable graph document contains a collection key, never executable HTML or library contents. */
export interface WikiDocument { format: "zotero-agent-wiki-graph"; version: 1; collectionKey: string; title: string }
export function parseWikiDocument(text: string): WikiDocument {
  if (text.length > 4096) throw new Error("连接图文件过大");
  const v = JSON.parse(text);
  if (!v || v.format !== "zotero-agent-wiki-graph" || v.version !== 1 || !/^[A-Z0-9]{8}$/.test(v.collectionKey)) throw new Error("连接图文件格式不正确或版本不受支持");
  return { format: v.format, version: 1, collectionKey: v.collectionKey, title: typeof v.title === "string" ? v.title.replace(/[\u0000-\u001f]/g, "").slice(0, 100) || "知识连接图" : "知识连接图" };
}
export const isWikiFilename = (name: unknown): boolean => typeof name === "string" && /\.zoterowiki$/i.test(name);
