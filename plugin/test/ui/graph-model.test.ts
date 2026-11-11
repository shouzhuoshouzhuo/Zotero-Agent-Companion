import assert from 'node:assert/strict';
import { it } from 'node:test';
import { graphLink, buildGraph, visibleGraph, graphLayout, type GraphRecord } from '../../src/ui/graph-model.ts';
const rec=(id:string,links:string[]=[],kind:GraphRecord['kind']='note'):GraphRecord=>({id,title:id,kind,links,uri:'zotero://select/library/items/'+id.split(':')[1]});
it('identifies library/group and Better Notes links without key collisions',()=>{
 assert.equal(graphLink('zotero://select/library/items/ABCDEFGH')!.id,'library:ABCDEFGH');
 assert.equal(graphLink('zotero://open-pdf/groups/123/items/ABCDEFGH?page=9&quote=x')!.id,'groups/123:ABCDEFGH');
 assert.equal(graphLink('zotero://note/u/ABCDEFGH/?line=3')!.id,'library:ABCDEFGH');
 assert.equal(graphLink('zotero://note/123/ABCDEFGH/')!.id,'groups/123:ABCDEFGH');
 for(const u of ['javascript:alert(1)','https://example.com','zotero://select/library/items/invalid','zotero://select/library/collections/ABCDEFGH'])assert.equal(graphLink(u),null);
});
it('keeps directed reciprocal edges, collapses page citations and skips self-links',()=>{
 const a=rec('library:AAAAAAAA',['zotero://open-pdf/library/items/BBBBBBBB?page=1','zotero://open-pdf/library/items/BBBBBBBB?page=2','zotero://select/library/items/AAAAAAAA']);
 const b=rec('library:BBBBBBBB',['zotero://select/library/items/AAAAAAAA'],'attachment');
 const g=buildGraph([a,b]);assert.equal(g.edges.length,2);assert.equal(g.edges[0]!.hrefs.length,2);
 assert.equal(g.edges[0]!.source,a.id);assert.equal(g.edges[1]!.source,b.id);
});
it('counts distinct unresolved targets and keeps hierarchy separate from note links',()=>{
 const a=rec('library:AAAAAAAA',['zotero://select/library/items/CCCCCCCC','zotero://select/library/items/CCCCCCCC']);
 const b={...rec('library:BBBBBBBB'),parent:a.id,related:[a.id]};a.related=[b.id];
 const g=buildGraph([a,b]);assert.equal(g.unresolved,1);assert.equal(g.edges.filter(e=>e.kind==='related').length,1);
 assert.equal(g.edges.filter(e=>e.kind==='parent').length,1);assert.equal(g.edges.filter(e=>e.kind==='link').length,0);
});
it('filters attachments, supports local neighbors and never fabricates links',()=>{
 const g=buildGraph([rec('library:AAAAAAAA',['zotero://select/library/items/BBBBBBBB']),rec('library:BBBBBBBB'),rec('library:CCCCCCCC'),rec('library:DDDDDDDD',[],'attachment')]);
 const v=visibleGraph(g,{attachments:false,parents:false,query:'',focus:'library:AAAAAAAA'});
 assert.equal(v.nodes.length,2);assert.equal(v.edges.length,1);
 assert.equal(visibleGraph(g,{attachments:true,parents:false,query:'CCCC'}).nodes.length,1);
 assert.equal(visibleGraph(g,{attachments:true,parents:false,query:'not-found'}).nodes.length,0);
});
it('layout is deterministic and finite for empty, isolated and dense graphs',()=>{
 for(const count of [0,1,40,200]){
 const records=Array.from({length:count},(_,i)=>rec('library:'+String(i).padStart(8,'0')));
 const g=buildGraph(records);const first=graphLayout(g);assert.deepEqual(first,graphLayout(g));assert.equal(first.size,count);
 for(const p of first.values()) assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
 }
});
