import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile, writeFile, rename, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createParagraphCache, type CacheIO } from "../src/zotero/bilingual-cache.ts";
import { createParagraphQueue } from "../src/zotero/bilingual-queue.ts";
import { intersectsViewport, splitTranslationText } from "../src/zotero/bilingual-sdt.ts";
import { createTranslator } from "../src/zotero/translate.ts";
import { withDefaults } from "../src/zotero/defaults.ts";

const identity = { backend: "codex/subscription", model: "gpt-6-luna", language: "zh-Hans", prompt: "translation prompt v1" };
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
async function waitFor(predicate: () => boolean) {
  for (let n = 0; n < 300; n++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 2)); }
  throw new Error("test condition timed out");
}
function memoryIO() {
  const files = new Map<string, string>();
  const io: CacheIO = { exists: async p => files.has(p), read: async p => files.get(p)!, write: async (p, data) => { files.set(p, data); } };
  return { files, io };
}

test("only currently visible paragraphs consume model calls; background tabs consume none", async () => {
  const { io } = memoryIO(); const cache = createParagraphCache("file", io);
  let visible = new Set(["one"]), active = true;
  const calls: string[] = [];
  const queue = createParagraphQueue({ cache, identity, visible: id => visible.has(id), active: () => active,
    translate: async (text, onText) => { calls.push(text); onText("中文:" + text); }, cancel() {}, onChange() {}, onProgress() {} });
  queue.add("one", "paragraph 1"); queue.add("two", "paragraph 2"); queue.add("three", "paragraph 3");
  await queue.tick(); await waitFor(() => queue.stats().done === 1);
  assert.deepEqual(calls, ["paragraph 1"]);
  visible = new Set(["two"]); active = false; await queue.tick(); await flush();
  assert.equal(calls.length, 1);
  active = true; await queue.tick(); await waitFor(() => queue.stats().done === 2);
  assert.deepEqual(calls, ["paragraph 1", "paragraph 2"]);
  queue.stop(); visible = new Set(["three"]); await queue.tick(); assert.equal(calls.length, 2);
});

test("a disk read finishing after the paragraph leaves the viewport does not trigger a request", async () => {
  let visible = true, release: (() => void) | undefined, calls = 0;
  const cache = createParagraphCache("file", { exists: async () => { await new Promise<void>(r => { release = r; }); return false; }, read: async () => "", write: async () => {} });
  const queue = createParagraphQueue({ cache, identity, visible: () => visible, active: () => true,
    translate: async () => { calls++; }, cancel() {}, onChange() {}, onProgress() {} });
  queue.add("one", "paragraph"); const pending = queue.tick();
  await waitFor(() => !!release); visible = false; release!(); await pending;
  assert.equal(calls, 0); queue.stop();
});

test("persistent cache survives a new instance and makes a second reading cost zero model calls", async () => {
  const dir = mkdtempSync(join(tmpdir(), "zmc-bi-test-")); const path = join(dir, "cache.json");
  const io: CacheIO = { exists: async p => { try { await access(p); return true; } catch { return false; } },
    read: p => readFile(p, "utf8"), write: async (p, data) => { await writeFile(p + ".tmp", data); await rename(p + ".tmp", p); } };
  let calls = 0;
  const read = async () => {
    const queue = createParagraphQueue({ cache: createParagraphCache(path, io), identity, visible: () => true, active: () => true,
      translate: async (_, onText) => { calls++; onText("持续缓存的译文"); }, cancel() {}, onChange() {}, onProgress() {} });
    queue.add("p", "same source"); await queue.tick(); await waitFor(() => queue.stats().done === 1); queue.stop(); return queue.stats();
  };
  try {
    assert.equal((await read()).cached, 0); assert.equal(calls, 1);
    assert.equal((await read()).cached, 1); assert.equal(calls, 1);
    assert.match(await readFile(path, "utf8"), /持续缓存的译文/);
  } finally { rmSync(dir, { recursive: true }); }
});

test("source, target, model and prompt changes invalidate precisely their cache entries", async () => {
  const { io } = memoryIO(); const c = createParagraphCache("file", io);
  await c.put("text", identity, "译文");
  assert.equal(await c.get("text", identity), "译文");
  assert.equal(await c.get("changed text", identity), undefined);
  for (const patch of [{ language: "ja" }, { model: "gpt-6-sol" }, { prompt: "v2" }, { backend: "claude-code/subscription" }]) {
    assert.equal(await c.get("text", { ...identity, ...patch }), undefined);
  }
});

test("cancelled or failed streams never enter the persistent cache and are not retried automatically", async () => {
  const { io, files } = memoryIO(); const cache = createParagraphCache("file", io);
  let finish: (() => void) | undefined, cancelled = 0, calls = 0;
  const q = createParagraphQueue({ cache, identity, visible: () => true, active: () => true,
    translate: async (_, onText) => { calls++; onText("partial"); await new Promise<void>(r => { finish = r; }); }, cancel() { cancelled++; }, onChange() {}, onProgress() {} });
  q.add("p", "source"); void q.tick(); await waitFor(() => !!finish); q.stop(); finish!(); await flush();
  assert.equal(cancelled, 1); assert.equal(files.size, 0); assert.equal(calls, 1);
  const fail = createParagraphQueue({ cache, identity, visible: () => true, active: () => true,
    translate: async () => { calls++; throw new Error("network down"); }, cancel() {}, onChange() {}, onProgress() {} });
  fail.add("p", "source"); await fail.tick(); await waitFor(() => fail.stats().failed === 1);
  await fail.tick(); assert.equal(calls, 2); assert.equal(files.size, 0); fail.stop();
});

test("cache write failure is visible and does not pretend the translation was saved", async () => {
  const cache = createParagraphCache("file", { exists: async () => false, read: async () => "", write: async () => { throw new Error("disk full"); } });
  let last: any;
  const q = createParagraphQueue({ cache, identity, visible: () => true, active: () => true,
    translate: async (_, cb) => cb("valid translation"), cancel() {}, onChange: j => { last = { ...j }; }, onProgress() {} });
  q.add("p", "text"); await q.tick(); await waitFor(() => q.stats().failed === 1);
  assert.equal(last.result, "valid translation"); assert.match(last.error, /disk full/); assert.equal(await cache.get("text", identity), undefined); q.stop();
});

test("corrupt cache is preserved and never silently overwritten", async () => {
  const { io, files } = memoryIO(); files.set("file", "{bad json");
  const c = createParagraphCache("file", io);
  await assert.rejects(c.get("text", identity)); await assert.rejects(c.put("text", identity, "译文"));
  assert.equal(files.get("file"), "{bad json");
});

test("viewport boundaries exclude even nearby offscreen paragraphs; long paragraphs keep their tail", () => {
  const rect = { top: 0, bottom: 30, left: 0, right: 100, width: 100, height: 30 };
  assert.equal(intersectsViewport(rect, 800, 600), true);
  assert.equal(intersectsViewport({ ...rect, top: 600, bottom: 630 }, 800, 600), false);
  assert.equal(intersectsViewport({ ...rect, top: -30, bottom: 0 }, 800, 600), false);
  assert.equal(intersectsViewport({ ...rect, width: 0 }, 800, 600), false);
  const source = "x".repeat(5999) + "🐫" + "z".repeat(7000);
  const chunks = splitTranslationText(source);
  assert.ok(chunks.every(c => c.length <= 6000)); assert.equal(chunks.join(""), source);
});

test("cancel during session initialization cannot send a prompt later, and strict model mismatch is an error", async () => {
  let resolve: ((s: any) => void) | undefined, prompts = 0, closed = 0;
  const session = { currentModel: () => "gpt-6-luna", models: () => [], efforts: () => [], on: () => () => {}, prompt: async () => { prompts++; }, close: async () => { closed++; } };
  const settings = withDefaults({ backend: "codex", translateTo: "zh-Hans", translateModel: { codex: "gpt-6-luna", "claude-code": "", pi: "", custom: "" } }, "zh-CN");
  const engine = createTranslator({ runtime: { start: () => new Promise(r => { resolve = r; }) }, settings: () => settings, cwd: async () => "/tmp", env: async () => ({}), strictModel: true });
  const pending = engine.translate({ text: "source", onText() {} }); await waitFor(() => !!resolve);
  engine.cancel(); resolve!(session); await pending; assert.equal(prompts, 0); await engine.dispose(); assert.equal(closed, 1);
  const wrong = createTranslator({ runtime: { start: async () => ({ ...session, currentModel: () => "gpt-6-sol", setModel: async () => {} } as any) }, settings: () => settings,
    cwd: async () => "/tmp", env: async () => ({}), strictModel: true });
  await assert.rejects(wrong.translate({ text: "source", onText() {} }), /翻译模型未生效/);
  assert.equal(prompts, 0); await wrong.dispose();
});

test("explicit retranslation bypasses cache and atomically replaces it; a failed refresh retains the saved translation", async () => {
  const { io } = memoryIO(); const cache = createParagraphCache("refresh", io);
  await cache.put("source", identity, "已有译文");
  let calls = 0;
  const q = createParagraphQueue({ cache, identity, active: () => true, visible: () => true,
    translate: async (_, emit) => { calls++; if (calls === 2) throw new Error("offline"); emit("新版译文"); },
    cancel() {}, onChange() {}, onProgress() {} });
  q.add("p", "source"); await q.tick(); await waitFor(() => q.stats().done === 1);
  assert.equal(calls, 0);
  q.retry("p", true); await waitFor(() => calls === 1 && q.stats().done === 1);
  assert.equal(await cache.get("source", identity), "新版译文");
  q.retry("p", true); await waitFor(() => q.stats().failed === 1);
  assert.equal(calls, 2); assert.equal(await cache.get("source", identity), "新版译文"); q.stop();
});
