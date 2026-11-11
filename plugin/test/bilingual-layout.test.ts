import { test } from "node:test";
import assert from "node:assert/strict";
import { createReadingLayout } from "../src/zotero/bilingual-layout.ts";

test("streaming changes coalesce into a native cache invalidation and synchronous popup/overlay update", () => {
  let next = 0; const frames = new Map<number, () => void>(); const calls: boolean[] = [];
  const layout = createReadingLayout({ _handleViewUpdate(sync) { calls.push(sync); } }, {
    requestAnimationFrame(cb) { frames.set(++next, cb); return next; }, cancelAnimationFrame(id) { frames.delete(id); },
  });
  layout.changed(); layout.changed(); layout.changed(); assert.equal(frames.size, 1);
  [...frames.values()][0]!(); assert.deepEqual(calls, [true]); assert.equal(frames.size, 0);
  layout.changed(); layout.flush(); assert.deepEqual(calls, [true, true]); assert.equal(frames.size, 0);
  layout.changed(); layout.dispose(); assert.equal(frames.size, 0);
  layout.changed(); layout.flush(); assert.deepEqual(calls, [true, true]);
});
