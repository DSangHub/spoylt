const test = require('node:test');
const assert = require('node:assert/strict');
const {create} = require('../js/password-recovery.js');
function setup(overrides={}) {
  const values=new Map(); const calls=[]; let time=1000;
  const auth={
    resetPasswordForEmail:async(email,options)=>{calls.push(['email',email,options]);return {error:null};},
    getUser:async()=>({data:{user:{id:'owner'}},error:null}),
    updateUser:async(data)=>{calls.push(['update',data]);return {error:null};},
    signOut:async(options)=>{calls.push(['signOut',options]);return {error:null};},...overrides,
  };
  const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  return {flow:create(auth,storage,()=>time),calls,values,auth,storage,advance:ms=>time+=ms};
}
test('reset email uses production root and a neutral account-existence response',async()=>{
 const s=setup();const result=await s.flow.request(' person@example.invalid ');
 assert.match(result,/If an account exists/);
 assert.deepEqual(s.calls[0],['email','person@example.invalid',{redirectTo:'https://www.spoylt.org/'}]);
 await assert.rejects(s.flow.request('bad-email'));assert.equal(s.calls.length,1);
});
test('update cannot run without a recovery session',async()=>{
 const s=setup();await assert.rejects(s.flow.change('long-password','long-password'),/expired/);assert.equal(s.calls.length,0);
});
test('password length and confirmation are checked before update',async()=>{
 const s=setup();s.flow.activate({user:{id:'owner'}});
 await assert.rejects(s.flow.change('short','short'),/8–128/);
 await assert.rejects(s.flow.change('long-password','different'),/do not match/);assert.equal(s.calls.length,0);
});
test('server-rejected or different user sessions cannot reset a password',async()=>{
 for(const response of [{data:{user:{id:'other'}},error:null},{data:{user:null},error:{message:'expired'}}]){
  const s=setup({getUser:async()=>response});s.flow.activate({user:{id:'owner'}});
  await assert.rejects(s.flow.change('long-password','long-password'),/no longer valid/);assert.equal(s.calls.length,0);assert.equal(s.flow.active(),false);
 }
});
test('recovery survives same-account refresh, expires and never stores passwords',async()=>{
 const s=setup();s.flow.activate({user:{id:'owner'}});
 const restored=create(s.auth,s.storage,()=>1000);assert.equal(restored.resume({user:{id:'owner'}}),true);
 s.advance(15*60*1000);await assert.rejects(s.flow.change('long-password','long-password'),/expired/);
 assert.equal(s.values.size,0);assert.equal(s.calls.length,0);
});
test('successful change clears recovery and revokes refresh sessions',async()=>{
 const s=setup();s.flow.activate({user:{id:'owner'}});
 assert.match(await s.flow.change('long-password','long-password'),/Password updated/);
 assert.deepEqual(s.calls,[['update',{password:'long-password'}],['signOut',{scope:'global'}]]);
 assert.equal(s.flow.active(),false);assert.equal(s.values.size,0);
});
test('rate limits and password provider failures are actionable without leaking provider details',async()=>{
 const s=setup({resetPasswordForEmail:async()=>({error:{status:429}})});
 await assert.rejects(s.flow.request('person@example.invalid'),/wait a few minutes/);
 const p=setup({updateUser:async()=>({error:{code:'weak_password'}})});p.flow.activate({user:{id:'owner'}});
 await assert.rejects(p.flow.change('long-password','long-password'),/stronger password/);assert.equal(p.flow.active(),true);
});
