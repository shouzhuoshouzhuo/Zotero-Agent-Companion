import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseWikiDocument,isWikiFilename} from '../src/wiki-document.ts';
test('graph documents accept only a versioned collection reference',()=>{
 const doc={format:'zotero-agent-wiki-graph',version:1,collectionKey:'RZM79Y2A',title:'Agent Security'};
 assert.deepEqual(parseWikiDocument(JSON.stringify(doc)),doc);
 for(const change of [{version:2},{collectionKey:'../escape'},{format:'html'}])assert.throws(()=>parseWikiDocument(JSON.stringify({...doc,...change})));
 assert.throws(()=>parseWikiDocument('x'.repeat(4097)));
 assert.equal(isWikiFilename('知识连接图.zoterowiki'),true);
 assert.equal(isWikiFilename('paper.pdf'),false);
});
