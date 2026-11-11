/** Local successful-result cache. No partial responses, errors, or credentials are stored. */
export interface TranslationIdentity {
  backend: string;
  model: string;
  language: string;
  prompt: string;
}
export interface CacheIO {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  /** Must replace the destination atomically. */
  write(path: string, data: string): Promise<void>;
}
export const paragraphCacheKey = (text: string, identity: TranslationIdentity) =>
  JSON.stringify([text, identity.backend, identity.model, identity.language, identity.prompt]);

export function createParagraphCache(path: string, io: CacheIO) {
  let loading: Promise<Map<string, string>> | undefined;
  let writes: Promise<void> = Promise.resolve();
  const load = () => loading ??= (async () => {
    if (!await io.exists(path)) return new Map<string, string>();
    const data: unknown = JSON.parse(await io.read(path));
    if (!data || typeof data !== "object" || (data as any).version !== 1 || !Array.isArray((data as any).entries)) {
      throw new Error("双语翻译缓存格式无效，已保留原文件，请检查后重试。");
    }
    const entries = (data as any).entries as unknown[];
    if (!entries.every(e => Array.isArray(e) && e.length === 2 && typeof e[0] === "string" && typeof e[1] === "string")) {
      throw new Error("双语翻译缓存内容无效，已保留原文件。");
    }
    return new Map(entries as [string, string][]);
  })();
  return {
    async get(text: string, identity: TranslationIdentity) { return (await load()).get(paragraphCacheKey(text, identity)); },
    async put(text: string, identity: TranslationIdentity, result: string) {
      if (!result.trim()) throw new Error("空译文不能写入缓存");
      const key = paragraphCacheKey(text, identity);
      const write = async () => {
        const current = await load();
        const next = new Map(current);
        next.set(key, result.trim());
        await io.write(path, JSON.stringify({ version: 1, entries: [...next] }));
        current.set(key, result.trim());
      };
      const p = writes.then(write, write); writes = p.catch(() => undefined); await p;
    },
    flush: () => writes,
  };
}

export type ParagraphCache = ReturnType<typeof createParagraphCache>;
