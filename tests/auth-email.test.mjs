import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
const source = fs.readFileSync(new URL('../supabase/functions/auth-email/index.ts', import.meta.url), 'utf8');
function hook({redirect='http://127.0.0.1:4317/', action='recovery', authorized=true, delivery=true}={}) {
  const calls=[]; let handler;
  const event={user:{id:'test-user',email:'test@example.test'},email_data:{email_action_type:action,token_hash:'hash-for-test',redirect_to:redirect}};
  const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-only',SEND_EMAIL_HOOK_SECRET:'v1,whsec_test-only',RESEND_API_KEY:'test-only',MAIL_FROM:'NutriGalletas <test@example.test>',RECOVERY_REDIRECT_URL:'http://127.0.0.1:4317/'};
  class Webhook { verify(){ return event; } }
  const context={Response,URL,Webhook,Object,createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return{data:authorized,error:null}}}),fetch:async(url,options)=>{calls.push({url,options});return {ok:delivery}},Deno:{env:{get:key=>env[key]},serve:fn=>handler=fn}};
  const js=stripTypeScriptTypes(source).replace(/^import .*;\n/gm,'');
  vm.runInNewContext(js,context);
  return {calls,run:()=>handler(new Request('https://example.test',{method:'POST',body:'{}'}))};
}
test('Recovery rejects a foreign redirect before consuming permission',async()=>{
  const h=hook({redirect:'https://evil.example.test/'});assert.equal((await h.run()).status,403);assert.equal(h.calls.length,0);
});
test('Recovery rejects non-recovery email actions',async()=>{
  const h=hook({action:'signup'});assert.equal((await h.run()).status,403);assert.equal(h.calls.length,0);
});
test('Recovery without server authorization never sends an email',async()=>{
  const h=hook({authorized:false});assert.equal((await h.run()).status,403);assert.equal(h.calls.length,1);
});
test('Authorized recovery sends the token only to the intended recipient and redirect',async()=>{
  const h=hook();assert.equal((await h.run()).status,200);assert.equal(h.calls[0].name,'consumir_recuperacion');
  const body=JSON.parse(h.calls[1].options.body);assert.deepEqual(body.to,['test@example.test']);
  const link=new URL(body.text.match(/https:\/\/\S+/)[0]);assert.equal(link.origin,'https://example.supabase.co');assert.equal(link.pathname,'/auth/v1/verify');assert.equal(link.searchParams.get('type'),'recovery');assert.equal(link.searchParams.get('token'),'hash-for-test');assert.equal(link.searchParams.get('redirect_to'),'http://127.0.0.1:4317/');
});
test('Provider failure is reported as failure rather than delivery',async()=>{
  const h=hook({delivery:false});assert.equal((await h.run()).status,500);
});
