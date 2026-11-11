import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeGuidance, RULE_START, RULE_END, WIKI_RULES, WIKI_SKILL } from "../src/zotero/setup-model.ts";
test("guidance is idempotent and retains user rules around its managed block", () => {
  const original = "# Team rules\nNever change PDFs.\n";
  const merged = mergeGuidance(original);
  assert.ok(merged.startsWith(original));
  assert.equal(mergeGuidance(merged), merged);
  const old = `before\n${RULE_START}\nstale\n${RULE_END}\nafter\n`;
  assert.equal(mergeGuidance(old), `before\n${WIKI_RULES}\nafter\n`);
});
test("malformed guidance never consumes user instructions", () => {
  for (const s of [RULE_START, RULE_END, RULE_END + RULE_START, RULE_START + RULE_START + RULE_END]) assert.throws(() => mergeGuidance(s));
});
test("portable Wiki rules have no personal paths or specific library IDs", () => {
  assert.doesNotMatch(WIKI_SKILL + WIKI_RULES, /\/Users\/|Agent Security|RZM79Y2A/);
  assert.match(WIKI_SKILL, /read-only/);
  assert.match(WIKI_SKILL, /actual page coverage/);
});
