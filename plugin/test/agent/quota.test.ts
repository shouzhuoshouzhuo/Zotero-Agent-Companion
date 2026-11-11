import assert from 'node:assert/strict';
import { it } from 'node:test';
import { parseQuota, readCodexQuota } from '../../src/agent/quota.ts';
import type { Proc, Spawner } from '../../src/types.ts';

it('selects the Codex bucket, converts usage and preserves reset seconds', () => {
  const q = parseQuota({rateLimits: {limitId:'other',primary:{usedPercent:90}}, rateLimitsByLimitId:{codex:{primary:{usedPercent:11,windowDurationMins:10080,resetsAt:1794897109},secondary:{usedPercent:120},credits:{hasCredits:true,balance:'5.25'}}}});
  assert.deepEqual(q.windows,[{remainingPercent:89,minutes:10080,resetsAt:1794897109},{remainingPercent:0}]);
  assert.deepEqual(q.credits,{balance:'5.25'});
});
it('handles legacy data and null primary without inventing a window', () => {
  assert.deepEqual(parseQuota({rateLimits:{primary:null,secondary:{usedPercent:0}}}).windows,[{remainingPercent:100}]);
  assert.deepEqual(parseQuota({rateLimits:{credits:{unlimited:true}}}).credits,{unlimited:true});
});
it('rejects missing, malformed and unrelated quota data', () => {
  for (const r of [null,{}, {rateLimits:{primary:{usedPercent:NaN}}}, {rateLimits:{primary:{usedPercent:-1}}}, {rateLimits:{primary:{usedPercent:'10'}}}, {rateLimits:{limitId:'other',primary:{usedPercent:5}}}]) assert.throws(()=>parseQuota(r));
});
function fake(type='chatgpt', silent=false, rpcError=false) {
  let listener = (_s:string)=>{};
  let end!: (code:number|null)=>void;
  const frames: Record<string,unknown>[]=[];
  let killed=0;
  const proc: Proc={pid:1, exited:new Promise(r=>{end=r;}),onStdoutLine(cb){listener=cb;},onStderr(){},async kill(){killed++;end(null);},write(line){
    const f=JSON.parse(line); frames.push(f);
    if (!f.id || silent) return;
    let result:unknown={};
    if(f.method==='account/read') result={account:{type,planType:'pro'}};
    if(f.method==='account/rateLimits/read') result={rateLimits:{primary:{usedPercent:25,windowDurationMins:300}}};
    queueMicrotask(()=>listener(JSON.stringify(rpcError?{id:f.id,error:{code:-32601,message:'unsupported'}}:{id:f.id,result})));
  }};
  const spawner:Spawner={async spawn(){return proc;},async run(){throw Error('unused');},async baseEnv(){return {};}};
  return {spawner,frames,killed:()=>killed};
}
it('reads only account RPCs and always stops its child', async()=>{
 const f=fake();const q=await readCodexQuota(f.spawner,'codex',[],{});
 assert.equal(q.windows[0]!.remainingPercent,75);assert.equal(q.plan,'pro');assert.equal(f.killed(),1);
 assert.deepEqual(f.frames.map(x=>x.method),['initialize','initialized','account/read','account/rateLimits/read']);
});
it('does not request subscription quota for API-key auth',async()=>{
 const f=fake('apiKey');await assert.rejects(readCodexQuota(f.spawner,'codex',[],{}),/subscription/);
 assert.equal(f.killed(),1);assert.equal(f.frames.some(x=>x.method==='account/rateLimits/read'),false);
});
it('cleans up on timeout and unsupported RPCs',async()=>{
 const f=fake('chatgpt',true);await assert.rejects(readCodexQuota(f.spawner,'codex',[],{},15),/timed out/);assert.equal(f.killed(),1);
 const e=fake('chatgpt',false,true);await assert.rejects(readCodexQuota(e.spawner,'codex',[],{}),/unsupported/);assert.equal(e.killed(),1);
});
