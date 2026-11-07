import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudStore } from '../src/supabase.js';
function storeWith(sessionPromise) {
  const calls=[]; const s=new CloudStore(); s.user={id:'test-admin'};
  const channel={on(){calls.push('listen');return this},subscribe(){calls.push('subscribe');return this}};
  s.client={auth:{getSession:()=>sessionPromise},realtime:{setAuth:async token=>{assert.equal(token,'test-session');calls.push('authenticate')}},channel:()=>{calls.push('channel');return channel},removeChannel:()=>calls.push('remove')};
  return {s,calls};
}
test('Realtime authenticates before subscribing and stops cleanly',async()=>{
  const {s,calls}=storeWith(Promise.resolve({data:{session:{access_token:'test-session'}},error:null}));
  try{await s.startUpdates(()=>{});assert.deepEqual(calls,['authenticate','channel','listen','subscribe']);assert.ok(s.timer)}finally{s.stopUpdates()}
  assert.equal(calls.at(-1),'remove');assert.equal(s.timer,undefined);
});
test('A stopped pending subscription cannot attach after logout',async()=>{
  let resolve;const {s,calls}=storeWith(new Promise(r=>resolve=r));const pending=s.startUpdates(()=>{});s.stopUpdates();s.user=null;
  resolve({data:{session:{access_token:'test-session'}},error:null});await pending;assert.deepEqual(calls,[]);assert.equal(s.timer,undefined);
});
test('No session means no Realtime subscription',async()=>{
  const {s,calls}=storeWith(Promise.resolve({data:{session:null},error:null}));await assert.rejects(s.startUpdates(()=>{}),/sesión terminó/);assert.deepEqual(calls,[]);
});


test('Logout stops updates before waiting for remote revocation',async()=>{
  const {s,calls}=storeWith(Promise.resolve({data:{session:{access_token:'test-session'}},error:null}));
  await s.startUpdates(()=>{});
  let finish; s.action=()=>new Promise(r=>finish=r); let signedOut=false;
  s.client.auth.signOut=async()=>{signedOut=true};
  const pending=s.logout();
  assert.equal(s.timer,undefined);assert.equal(calls.at(-1),'remove');assert.equal(signedOut,false);
  finish(); await pending;assert.equal(signedOut,true);assert.equal(s.user,null);
});
