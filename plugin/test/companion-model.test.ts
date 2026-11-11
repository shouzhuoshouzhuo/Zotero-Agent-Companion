import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLesson, locateQuote, placeCards } from "../src/zotero/companion-model.ts";
const lesson = () => ({ version: 1, fingerprint: "pdf1", status: "ready", title: "Paper", coverage: [{start:1,end:3,mode:"text"}], unresolved: ["Figure not checked"], points: [{ id:"one",page:1,quote:"An exact source quotation",title:"重点",explanation:"解释",links:[] }] });
test("teaching is gated on complete declared coverage and the exact PDF version",()=>{
  assert.equal(parseLesson(lesson(),"pdf1",3).status,"ready");
  assert.throws(()=>parseLesson(lesson(),"changed",3),/不匹配/);
  const partial=lesson();partial.coverage[0]!.end=2;assert.throws(()=>parseLesson(partial,"pdf1",3),/全部/);
  const invalid=lesson();invalid.points[0]!.page=4;assert.throws(()=>parseLesson(invalid,"pdf1",3),/越界/);
});
test("malformed, duplicate and executable link material cannot become teaching cards",()=>{
  const duplicate=lesson();duplicate.points.push({...duplicate.points[0]!});assert.throws(()=>parseLesson(duplicate,"pdf1",3),/重复/);
  const linked:any=lesson();linked.points[0].links=[{label:"evil",uri:"javascript:alert(1)"}];assert.throws(()=>parseLesson(linked,"pdf1",3),/链接/);
});
test("quote matching tolerates line hyphens but rejects ambiguous or fabricated text",()=>{
 const text="The infor-mation flow is controlled.";
 const chars=[...text].map((u,i)=>({u,rect:[i,10,i+1,20],lineBreakAfter:i===13}));
 const rects=locateQuote(chars,"The information flow is controlled.");assert.equal(rects?.length,2);
 assert.equal(locateQuote(chars,"The model is always safe"),null);
 assert.equal(locateQuote([...chars,...chars],"information flow"),null);
 assert.equal(locateQuote([{u:"test",rect:[NaN,0,1,2]}],"test"),null);
});
test("margin cards avoid overlap on each side without pinning offscreen cards to the viewport",()=>{
 const placed=placeCards([{id:"a",top:-100,height:50,side:"left"},{id:"b",top:-80,height:60,side:"left"},{id:"c",top:-80,height:50,side:"right"}]);
 assert.equal(placed.find(p=>p.id==="a")!.top,-100);assert.equal(placed.find(p=>p.id==="b")!.top,-38);assert.equal(placed.find(p=>p.id==="c")!.top,-80);
});
