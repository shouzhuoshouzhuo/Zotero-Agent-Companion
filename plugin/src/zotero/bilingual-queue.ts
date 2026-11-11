import type { ParagraphCache, TranslationIdentity } from "./bilingual-cache.ts";

export type ParagraphStatus = "waiting" | "loading" | "done" | "error";
export class ParagraphInterrupted extends Error {}
export interface ParagraphJob {
  id: string; text: string; status: ParagraphStatus; result: string; error: string; cached: boolean;
}
export interface ParagraphQueueOptions {
  cache: ParagraphCache;
  identity: TranslationIdentity;
  visible(id: string): boolean;
  active(): boolean;
  translate(text: string, onText: (delta: string) => void, canContinue: () => boolean): Promise<void>;
  cancel(): void;
  onChange(job: ParagraphJob): void;
  onProgress(): void;
}

/** One request at a time. Visibility is checked again after disk reads, immediately before using tokens. */
export function createParagraphQueue(o: ParagraphQueueOptions) {
  const jobs = new Map<string, ParagraphJob>();
  const refresh = new Set<string>();
  let stopped = false, busy = false, paused = false, activeJob: ParagraphJob | undefined;
  let generation = 0;
  let pending: Promise<void> = Promise.resolve();
  const emit = (job: ParagraphJob) => { o.onChange(job); o.onProgress(); };

  async function pump() {
    if (stopped || paused || busy || !o.active()) return;
    const job = [...jobs.values()].find(j => j.status === "waiting" && o.visible(j.id));
    if (!job) return;
    busy = true; activeJob = job;
    const token = generation;
    const current = () => !stopped && token === generation;
    try {
      // Check the persistent cache before invoking any translation session.
      const cached = refresh.has(job.id) ? undefined : await o.cache.get(job.text, o.identity);
      if (!current()) return;
      if (cached) { job.result = cached; job.cached = true; job.status = "done"; emit(job); return; }
      if (paused || !o.active() || !o.visible(job.id)) return;
      job.status = "loading"; job.result = ""; emit(job);
      let result = "";
      await o.translate(job.text, delta => {
        if (!current()) return;
        result += delta; job.result = result; o.onChange(job);
      }, () => current() && !paused && o.active() && o.visible(job.id));
      if (!current()) return;
      if (!result.trim()) throw new Error("模型未返回译文，请点击重试");
      job.result = result.trim();
      // Keep a valid result visible even if the disk write fails; the UI must say it wasn't saved.
      await o.cache.put(job.text, o.identity, job.result);
      refresh.delete(job.id);
      if (!current()) return;
      job.status = "done"; emit(job);
    } catch (e) {
      if (current()) {
        if (e instanceof ParagraphInterrupted) { job.status = "waiting"; job.result = ""; }
        else { job.status = "error"; job.error = e instanceof Error ? e.message : String(e); }
        emit(job);
      }
    } finally {
      if (!current() && job.status === "loading") { job.status = "waiting"; job.result = ""; emit(job); }
      busy = false; activeJob = undefined;
      if (!stopped && !paused) void tick();
    }
  }
  function tick() {
    // If the tab is hidden, cancel its request and do not start any other paragraph.
    if ((!o.active() || paused) && activeJob?.status === "loading") { ++generation; o.cancel(); }
    const p = pump(); pending = p; return p;
  }
  return {
    add(id: string, text: string) {
      const old = jobs.get(id);
      if (old && old.text === text) { emit(old); return; }
      if (old && activeJob === old) { ++generation; o.cancel(); }
      jobs.set(id, { id, text, status: "waiting", result: "", error: "", cached: false });
    },
    tick,
    retry(id: string, force = false) {
      const job = jobs.get(id); if (!job || job.status === "loading") return;
      if (job.status === "done" && !force) return;
      if (force) refresh.add(id);
      job.status = "waiting"; job.error = ""; job.cached = false; emit(job); void tick();
    },
    pause(value: boolean) { paused = value; void tick(); },
    stats: () => ({ total: jobs.size, done: [...jobs.values()].filter(j => j.status === "done").length,
      cached: [...jobs.values()].filter(j => j.cached).length, failed: [...jobs.values()].filter(j => j.status === "error").length,
      paused, busy }),
    stop() { stopped = true; ++generation; if (activeJob?.status === "loading") o.cancel(); },
    settled: () => pending,
  };
}
