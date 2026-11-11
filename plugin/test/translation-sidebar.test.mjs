import { test } from 'node:test';
import assert from 'node:assert/strict';
import { language, LANGUAGES } from '../src/ui/settings-model.ts';
import { translatorPrompt } from '../src/agent/translate.ts';
import { createTranslationSidebar, translationLanguageID } from '../src/zotero/translation-sidebar.ts';

class Element {
  children = []; style = {}; attrs = {}; className = ''; value = ''; listeners = {}; isConnected = true;
  constructor(doc, tag) { this.ownerDocument = doc; this.tag = tag; }
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return this.text + this.children.map(x => x.textContent).join(''); }
  setAttribute(k, v) { this.attrs[k] = v; }
  append(...kids) { this.children.push(...kids); }
  replaceChildren(...kids) { this.text = ''; this.children = kids; }
  addEventListener(k, cb) { this.listeners[k] = cb; }
  closest() { return this.details; }
  get options() { return this.children; }
  querySelector(selector) {
    for (const el of this.children) {
      if (selector.startsWith('.') && el.className === selector.slice(1)) return el;
      if (el.tag === selector) return el;
      const nested = el.querySelector(selector); if (nested) return nested;
    }
    return null;
  }
}

test('sidebar keeps results by reader, ignores cancelled streams, and cleans up', async () => {
  let hooks, cancelled = 0, unregistered = false, removed = false;
  globalThis.ChromeUtils = { importESModule: () => ({ L10nRegistry: { registerSources() {}, removeSources() { removed = true; } }, L10nFileSource: class {} }) };
  const readers = new Map();
  globalThis.Zotero = {
    locale: 'zh-CN', Reader: { getByTabID: id => readers.get(id) },
    ItemPaneManager: { registerSection(o) { hooks = o; return 'registered-sidebar'; }, unregisterSection() { unregistered = true; } },
    Utilities: { Internal: { copyTextToClipboard() {} } },
  };
  const doc = { createElementNS: (_, tag) => new Element(doc, tag), l10n: { addResourceIds() {} }, querySelectorAll: () => [] };
  const calls = [];
  const sidebar = createTranslationSidebar({ id: 'test', rootURI: 'file:///test/', language: () => 'zh-CN', cancel() { cancelled++; }, translate(req) { return new Promise((resolve, reject) => calls.push({ req, resolve, reject })); } });
  const body = id => { const b = new Element(doc, 'body'); b.text = ''; b.details = { tabID: id }; return b; };
  const a = body('A'), b = body('B');
  const reader = id => { const r = { tabID: id, itemID: id, _window: { document: doc } }; readers.set(id, r); return r; };
  const ra = reader('A'), rb = reader('B');
  hooks.onInit({ doc, body: a }); hooks.onRender({ body: b });
  assert.match(a.textContent, /选中文字/);
  const show = (r, text) => sidebar.show({ reader: r, params: { annotation: { text } } });
  show(ra, 'Original\nparagraph');
  assert.equal(calls[0].req.to, 'zh-Hans');
  assert.equal(a.querySelector('select').value, 'zh-Hans');
  assert.match(translatorPrompt(language(calls[0].req.to).name), /into Simplified Chinese/);
  calls[0].req.onText('译文一');
  assert.equal(a.querySelector('.zmc-translation-output').textContent, '译文一');
  assert.equal(b.querySelector('.zmc-translation-output'), null);
  assert.match(a.textContent, /Original\nparagraph/);
  // New text cancels the previous turn. Late callbacks cannot overwrite the new result.
  show(ra, '<script>not executable</script>');
  assert.equal(cancelled, 1);
  calls[0].req.onText('STALE'); calls[0].resolve();
  calls[1].req.onText('新译文'); calls[1].resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(a.querySelector('.zmc-translation-output').textContent, '新译文');
  assert.match(a.textContent, /<script>not executable<\/script>/);
  assert.doesNotMatch(a.textContent, /STALE/);
  // Changing papers must not display the other reader's source or result.
  show(rb, 'Second paper'); calls[2].req.onText('第二篇'); calls[2].resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(b.querySelector('.zmc-translation-output').textContent, '第二篇');
  assert.equal(a.querySelector('.zmc-translation-output').textContent, '新译文');
  hooks.onRender({ body: a }); // reader rerender / popup disappearance does not discard the translation
  assert.equal(a.querySelector('.zmc-translation-output').textContent, '新译文');
  show(ra, 'Error case'); calls[3].reject(new Error('service unavailable'));
  await new Promise(resolve => setImmediate(resolve));
  assert.match(a.textContent, /service unavailable/);
  // A large selection is explicit about the upstream translation limit.
  show(ra, 'x'.repeat(6100));
  assert.equal(calls[4].req.text.length, 6000);
  assert.match(a.textContent, /6000/);
  sidebar.dispose(); calls[4].req.onText('after disposal'); calls[4].resolve();
  assert.equal(unregistered, true); 
});

test('sidebar language IDs match the engine; locale aliases cannot silently become English', () => {
  for (const target of LANGUAGES) assert.equal(translationLanguageID(target.id), target.id);
  assert.equal(language(translationLanguageID('zh-CN')).name, 'Simplified Chinese');
  assert.equal(language(translationLanguageID('zh-TW')).name, 'Traditional Chinese');
  assert.equal(language(translationLanguageID('en')).name, 'English');
  assert.throws(() => translationLanguageID('unknown'), /不支持/);
});
