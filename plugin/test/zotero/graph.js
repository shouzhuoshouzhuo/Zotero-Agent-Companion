async function main(ctx) {
 const {Zotero,win}=ctx;
 const check=(v,msg)=>{if(!v)throw Error(msg);};
 const lib=Zotero.Libraries.userLibraryID;
 const rootCol=new Zotero.Collection();rootCol.libraryID=lib;rootCol.name='Agent Security';await rootCol.saveTx();
 const childCol=new Zotero.Collection();childCol.libraryID=lib;childCol.name='02 ZoteroLLMWiki';childCol.parentID=rootCol.id;await childCol.saveTx();
 const paper=new Zotero.Item('journalArticle');paper.libraryID=lib;paper.setField('title','Defeating Prompt Injections by Design');paper.setCollections([rootCol.id]);await paper.saveTx();
 const hub=new Zotero.Item('report');hub.libraryID=lib;hub.setField('title','ZoteroLLMWiki｜Agent Security');hub.setCollections([childCol.id]);await hub.saveTx();
 const names=['00｜Agent Security Wiki 首页','01｜提示词注入与威胁模型','02｜控制流、数据流与 CaMeL','03｜安全评估与安全边界','04｜研究问题与维护日志'];
 const notes=[];
 for(const title of names){const n=new Zotero.Item('note');n.libraryID=lib;n.parentID=hub.id;n.setNote('<h1>'+title+'</h1>');await n.saveTx();notes.push(n);}
 const external=new Zotero.Item('note');external.libraryID=lib;external.setNote('<h1>CaMeL 中文精读导航</h1>');await external.saveTx();
 const missing=new Zotero.Item('note');missing.libraryID=lib;missing.setNote('<h1>Trashed note</h1>');missing.deleted=true;await missing.saveTx();
 const uri=it=>'zotero://select/library/items/'+it.key;
 for(let i=0;i<notes.length;i++){
  const others=notes.filter(n=>n.id!==notes[i].id);
  notes[i].setNote('<h1>'+names[i]+'</h1><p>'+others.map(n=>'<a href="'+uri(n)+'">'+names[notes.indexOf(n)]+'</a>').join(' ')+'</p><p><a href="'+uri(paper)+'">来源论文</a> <a href="'+uri(external)+'">阅读导航</a> <a href="'+uri(missing)+'">失效来源</a></p>');
  await notes[i].saveTx();
 }
 const injected=ctx.plugin.windows.get(win);await ctx.resize(1280,900);injected.show();
 const root=await ctx.waitFor(()=>win.document.getElementById('zmc-root')?.shadowRoot?.querySelector('textarea')&&win.document.getElementById('zmc-root').shadowRoot,'panel');
 const host=ctx.plugin.panel().host;
 host.runtime.catalog=async()=>({models:[],modes:[],efforts:[]});
 Zotero.Prefs.set('extensions.zotero-chat.settings',JSON.stringify({...host.getSettings(),uiLanguage:'zh-Hans',welcomed:true}),true);
 await win.ZoteroPane.collectionsView.selectCollection(rootCol.id);
 const scopes=await host.wikiGraph.scopes();check(scopes.scopes.some(s=>s.name.includes('Agent Security / 02')),'nested scope path');
 const graph=await host.wikiGraph.read('lib:'+lib+':'+rootCol.key);
 check(graph.nodes.filter(n=>n.kind==='note').length===6,'child notes and one-hop outside note included: '+JSON.stringify(graph));
 check(!graph.nodes.some(n=>n.title==='Trashed note'),'trash excluded');
 check(graph.unresolved===1,'distinct missing target counted');
 check(graph.edges.filter(e=>e.kind==='link').length===30,'note links are actual directed edges');
 check(graph.edges.filter(e=>e.kind==='parent').length===5,'hierarchy is separate');
 check(graph.nodes.find(n=>n.title==='CaMeL 中文精读导航').external,'out-of-scope target marked');
 const $=s=>root.querySelector(s), $$=s=>[...root.querySelectorAll(s)];
 const graphButton=()=>$$('header button').find(b=>b.getAttribute('aria-label')==='Wiki 连接图');
 graphButton().click();await ctx.waitFor(()=>$$('.graph__node').length===8,'graph rendered');
 check($$('.graph__edge').length===30,'hierarchy hidden by default');
 const nodes=$$('.graph__node');nodes.find(n=>n.getAttribute('aria-label').includes('提示词注入')).dispatchEvent(new win.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
 check($('.graph__details').textContent.includes('入链（4）'),'incoming links shown');
 check($('.graph__details').textContent.includes('出链（6）'),'outgoing links shown');
 await ctx.snapshot('graph-light');
 ctx.Services.prefs.setIntPref('browser.theme.toolbar-theme',0);await ctx.sleep(300);await ctx.snapshot('graph-dark');ctx.Services.prefs.clearUserPref('browser.theme.toolbar-theme');
 const header=$('.hd').getBoundingClientRect();check($$('.hd > button').every(b=>b.getBoundingClientRect().right<=header.right+1),'header fits');
 const before=$('.graph__svg > g').getAttribute('transform');
 $$('button').find(b=>b.getAttribute('aria-label')==='放大').click();
 check($('.graph__svg > g').getAttribute('transform')!==before,'zoom works');
 const canvas=$('.graph__svg');
 // Synthetic pointer events do not create an OS pointer, so capture is stubbed while the real handlers run.
 canvas.setPointerCapture=()=>{};canvas.hasPointerCapture=()=>false;
 const moving=$$('.graph__node')[0], oldPos=moving.getAttribute('transform'), bounds=moving.getBoundingClientRect();
 const pointer=(target,type,x,y)=>target.dispatchEvent(new win.PointerEvent(type,{pointerId:77,button:0,clientX:x,clientY:y,bubbles:true}));
 pointer(moving,'pointerdown',bounds.x,bounds.y);pointer(canvas,'pointermove',bounds.x+25,bounds.y+15);pointer(canvas,'pointerup',bounds.x+25,bounds.y+15);
 check($$('.graph__node')[0].getAttribute('transform')!==oldPos,'node drag moves coordinates');
 check($$('.graph__node').every(n=>!/(NaN|Infinity|undefined)/.test(n.getAttribute('transform'))),'drag must preserve finite node coordinates');await ctx.sleep(20);
 const oldPan=canvas.firstElementChild.getAttribute('transform');
 pointer(canvas,'pointerdown',100,100);pointer(canvas,'pointermove',125,110);pointer(canvas,'pointerup',125,110);
 check(canvas.firstElementChild.getAttribute('transform')!==oldPan,'background drag pans');
 check(!/(NaN|Infinity|undefined)/.test(canvas.firstElementChild.getAttribute('transform')),'background pan must remain finite');await ctx.sleep(20);
 // A click often includes a tiny mouse movement. Repeated clicks must never move or lose nodes.
 const expectedCount=$$('.graph__node').length;
 for(let i=0;i<20;i++) {
  const node=$$('.graph__node')[i%expectedCount], id=node.getAttribute('data-id'), initial=node.getAttribute('transform'), rect=node.getBoundingClientRect();
  pointer(node,'pointerdown',rect.x+3,rect.y+3);pointer(canvas,'pointermove',rect.x+3.1,rect.y+3.1);pointer(canvas,'pointerup',rect.x+3.1,rect.y+3.1);
  const current=$$('.graph__node').find(n=>n.getAttribute('data-id')===id);
  check(current?.getAttribute('transform')===initial,'small click movement must not drag a node');
  check($$('.graph__node').length===expectedCount,'repeated clicks lost nodes');
  check($$('.graph__node').every(n=>!/(NaN|Infinity|undefined)/.test(n.getAttribute('transform'))),'repeated clicks corrupted node coordinates');
  await ctx.sleep(5);
 }
 $$('button').find(b=>b.getAttribute('aria-label')==='适应画布')?.click();
 await ctx.snapshot('graph-click-regression');
 const q=$('.graph__search');q.value='不存在的页面';q.dispatchEvent(new win.Event('input',{bubbles:true}));check($$('.graph__node').length===0,'search filters');check(!$('.graph__message').hidden,'empty search state');
 q.value='';q.dispatchEvent(new win.Event('input',{bubbles:true}));
 const local=$$('.graph__filters button')[0];local.click();check(local.textContent==='完整图谱','local mode toggles');local.click();
 const parents=$$('.graph__filters input')[1];parents.click();check($$('.graph__edge--parent').length===5,'hierarchy filter works');parents.click();
 // Open a real note through the host, not an external browser.
 await host.open(uri(notes[1]));check(win.ZoteroPane.getSelectedItems().some(it=>it.key===notes[1].key),'opens exact Zotero note');
 // Native updates should refresh without reopening the view.
 const extra=new Zotero.Item('note');extra.libraryID=lib;extra.parentID=hub.id;extra.setNote('<h1>新增概念页</h1><a href="'+uri(notes[0])+'">首页</a>');await extra.saveTx();
 await ctx.waitFor(()=>$$('.graph__node').some(n=>n.getAttribute('aria-label')==='新增概念页'),'notifier refresh');
 const real=host.wikiGraph.read;host.wikiGraph.read=async()=>{throw Error('test read failure');};
 $$('button').find(b=>b.getAttribute('aria-label')==='刷新连接图').click();await ctx.waitFor(()=>$('.graph__message')?.textContent.includes('test read failure'),'error state');
 host.wikiGraph.read=real;$$('button').find(b=>b.getAttribute('aria-label')==='刷新连接图').click();await ctx.waitFor(()=>$$('.graph__node').length===9,'refresh recovered');
 graphButton().click();check(!$('.graph'),'leaves graph');
 graphButton().click();await ctx.waitFor(()=>$$('.graph__node').length===9,'reopens graph cleanly');
 return {repeatedClicks:20,coordinatesFinite:true,nodes:graph.nodes.length,noteLinks:30,hierarchyLinks:5,missing:1,search:'ok',zoom:'ok',navigation:'ok',notifier:'ok',retry:'ok',cleanup:'ok'};
}
