async function main(ctx) {
 const {Zotero,win,IOUtils,PathUtils}=ctx;
 const check=(v,m)=>{if(!v)throw Error(m);};
 await ctx.resize(1400,900);
 Zotero.Prefs.set('extensions.zotero-chat.settings',JSON.stringify({uiLanguage:'zh-Hans',welcomed:true}),true);
 const lib=Zotero.Libraries.userLibraryID;
 const col=new Zotero.Collection();col.libraryID=lib;col.name='Agent Security';await col.saveTx();
 const hub=new Zotero.Item('report');hub.libraryID=lib;hub.setField('title','ZoteroLLMWiki｜Agent Security');hub.setCollections([col.id]);await hub.saveTx();
 const notes=[];
 for(const title of ['00｜Wiki 首页','01｜提示词注入','02｜CaMeL 控制流','03｜安全边界']) {
  const n=new Zotero.Item('note');n.libraryID=lib;n.parentID=hub.id;n.setNote('<h1>'+title+'</h1>');await n.saveTx();notes.push(n);
 }
 for(const n of notes){n.setNote(n.getNote()+'<p>'+notes.filter(x=>x.id!==n.id).map(x=>'<a href="zotero://select/library/items/'+x.key+'">相关页面</a>').join(' ')+'</p>');await n.saveTx();}
 const path=PathUtils.join(Zotero.Profile.dir,'knowledge.zoterowiki');
 await IOUtils.writeUTF8(path,JSON.stringify({format:'zotero-agent-wiki-graph',version:1,collectionKey:col.key,title:'Agent Security｜知识连接图'}));
 const att=await Zotero.Attachments.importFromFile({file:Zotero.File.pathToFile(path),parentItemID:hub.id});att.setField('title','知识连接图');await att.saveTx();
 await win.ZoteroPane.viewAttachment(att.id);
 await ctx.waitFor(()=>win.Zotero_Tabs.selectedType==='zmcwikigraph','main graph tab');
 const tab=win.Zotero_Tabs._tabs.find(t=>t.type==='zmcwikigraph');
 const container=win.document.getElementById(tab.id);
 const root=await ctx.waitFor(()=>container?.querySelector('div')?.shadowRoot,'graph shadow root');
 const $=s=>root.querySelector(s),$$=s=>[...root.querySelectorAll(s)];
 await ctx.waitFor(()=>$$('.graph__node').length===5,'graph nodes');
 check($$('.graph__edge').length===12,'directed links');
 check(!$$('.graph__node').some(n=>n.getAttribute('aria-label')==='知识连接图'),'document excluded from graph');
 await ctx.sleep(300);
 const box=$('.graph__svg').getBoundingClientRect();check(box.width>650&&box.height>400,'main canvas dimensions '+box.width+'x'+box.height);
 const canvas=$('.graph__svg'); canvas.setPointerCapture=()=>{};canvas.hasPointerCapture=()=>false;
 const pointer=(target,type,x,y)=>target.dispatchEvent(new win.PointerEvent(type,{pointerId:77,button:0,clientX:x,clientY:y,bubbles:true}));
 for(let i=0;i<12;i++) {
  const node=$$('.graph__node')[i%5], rect=node.getBoundingClientRect(), id=node.getAttribute('data-id'), old=node.getAttribute('transform');
  pointer(node,'pointerdown',rect.x+3,rect.y+3);pointer(canvas,'pointermove',rect.x+3.1,rect.y+3.1);pointer(canvas,'pointerup',rect.x+3.1,rect.y+3.1);
  check($$('.graph__node').find(n=>n.getAttribute('data-id')===id)?.getAttribute('transform')===old,'click jitter moved native-tab node');
  await ctx.sleep(5);
 }
 const first=$$('.graph__node')[0], firstRect=first.getBoundingClientRect();
 pointer(first,'pointerdown',firstRect.x+3,firstRect.y+3);pointer(canvas,'pointermove',firstRect.x+28,firstRect.y+18);pointer(canvas,'pointerup',firstRect.x+28,firstRect.y+18);await ctx.sleep(5);
 pointer(canvas,'pointerdown',300,300);pointer(canvas,'pointermove',325,315);pointer(canvas,'pointerup',325,315);await ctx.sleep(5);
 check($$('.graph__node').length===5&&$$('.graph__node').every(n=>!/(NaN|Infinity|undefined)/.test(n.getAttribute('transform'))),'native graph lost nodes after clicks/drag');
 check(!/(NaN|Infinity|undefined)/.test(canvas.firstElementChild.getAttribute('transform')),'native graph pan is invalid');
 await ctx.snapshot('graph-document-light');
 ctx.Services.prefs.setIntPref('browser.theme.toolbar-theme',0);await ctx.sleep(300);await ctx.snapshot('graph-document-dark');ctx.Services.prefs.clearUserPref('browser.theme.toolbar-theme');
 await win.ZoteroPane.viewAttachment(att.id);check(win.Zotero_Tabs._tabs.filter(t=>t.type==='zmcwikigraph').length===1,'reuses tab');
 $$('.graph__node').find(n=>n.getAttribute('aria-label').includes('提示词注入')).dispatchEvent(new win.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
 check($('.graph__details').textContent.includes('入链（3）'),'incoming links');
 $$('.graph__details button').find(b=>b.textContent.includes('打开')).click();
 await ctx.waitFor(()=>win.ZoteroPane.getSelectedItems().some(n=>n.id===notes[1].id),'native note navigation');
 win.Zotero_Tabs.select(tab.id);
 const extra=new Zotero.Item('note');extra.libraryID=lib;extra.parentID=hub.id;extra.setNote('<h1>新增研究问题</h1>');await extra.saveTx();
 await ctx.waitFor(()=>$$('.graph__node').length===6,'live refresh');
 win.Zotero_Tabs.close(tab.id);check(!root.firstChild,'tab disposed');
 await win.ZoteroPane.viewAttachment(att.id);
 await ctx.waitFor(()=>win.Zotero_Tabs._tabs.some(t=>t.type==='zmcwikigraph'&&t.id!==tab.id),'reopen');
 const pdf=await Zotero.Attachments.importFromFile({file:Zotero.File.pathToFile(ctx.env('ZMC_TEST_PDF')),libraryID:lib});
 await win.ZoteroPane.viewAttachment(pdf.id);
 await ctx.waitFor(()=>Zotero.Reader._readers.some(r=>r.itemID===pdf.id),'ordinary PDF handler preserved');
 return {repeatedClicks:12,coordinatesFinite:true,attachment:true,mainTab:true,nodes:5,links:12,canvas:{width:box.width,height:box.height},reuse:true,navigation:true,refresh:true,cleanup:true};
}
