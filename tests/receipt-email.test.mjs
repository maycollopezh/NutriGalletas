import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const source=await readFile(new URL('../supabase/functions/receipt-email/handler.ts',import.meta.url),'utf8');
const {createReceiptHandler,receiptContent}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const sale={numero:10,fecha:'6 nov 2026',metodo_pago:'efectivo',total:12,efectivo_recibido:20,cambio:8,vendedor:'Cajero',detalles:[{producto:'<img src=x>',lote:'L-001',vencimiento:'2027-01-01',cantidad:2,precio:6}]};
function fixture(){const events=[];return {events,deps:{origin:'https://tienda.example',configured:true,authorize:async()=> 'user',loadReceipt:async()=>sale,reserve:async()=>{events.push('reserve');return 'send-id';},send:async(email,data,content)=>{events.push(['send',email,data.total,content.html]);return 'provider';},finish:async(id,sent)=>events.push(['finish',id,sent])}};}
const req=(body={},token=true,origin='https://tienda.example')=>new Request('https://fn.example',{method:'POST',headers:{origin,'content-type':'application/json',...(token?{authorization:'Bearer token'}:{})},body:JSON.stringify({venta_id:'00000000-0000-4000-8000-000000000001',destinatario:'cliente@example.test',...body})});
test('Receipt service refuses foreign origins, missing sessions, and unauthorized sales without sending',async()=>{
 for(const kind of ['origin','token','session','sale']){const {deps,events}=fixture();if(kind==='session')deps.authorize=async()=>null;if(kind==='sale')deps.loadReceipt=async()=>null;const result=await createReceiptHandler(deps)(req({},kind!=='token',kind==='origin'?'https://evil.example':deps.origin));assert.ok([401,403].includes(result.status));assert.equal(events.length,0);}
});
test('Receipt amounts come from stored sale and HTML content is escaped',async()=>{
 const {deps,events}=fixture();const result=await createReceiptHandler(deps)(req({total:1,detalles:[]}));assert.equal(result.status,200);assert.equal(events[1][2],12);assert.ok(events[1][3].includes('&lt;img'));assert.ok(!events[1][3].includes('<img'));assert.deepEqual(events[2],['finish','send-id',true]);assert.ok(receiptContent(sale).text.includes('Cambio: Bs 8.00'));
});
test('Unconfigured email and provider failures never report success',async()=>{
 const {deps,events}=fixture();deps.configured=false;assert.equal((await createReceiptHandler(deps)(req())).status,503);assert.equal(events.length,0);deps.configured=true;deps.send=async()=>{throw new Error('SMTP failure');};const result=await createReceiptHandler(deps)(req());assert.equal(result.status,502);assert.deepEqual(events.at(-1),['finish','send-id',false]);
});
