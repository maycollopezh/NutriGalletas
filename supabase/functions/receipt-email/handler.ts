export type Receipt = { numero:number; fecha:string; metodo_pago:string; total:number; efectivo_recibido:number|null; cambio:number|null; vendedor:string; detalles:{producto:string;lote:string;vencimiento:string;cantidad:number;precio:number}[] };
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const money=(n:number)=>'Bs '+Number(n).toFixed(2);
export function receiptContent(sale:Receipt){
 const rows=sale.detalles.map(d=>`<tr><td>${esc(d.producto)}<br><small>Lote ${esc(d.lote)} · vence ${esc(d.vencimiento)}</small></td><td>${d.cantidad}</td><td>${money(d.precio)}</td><td>${money(d.precio*d.cantidad)}</td></tr>`).join('');
 const cash=sale.metodo_pago==='efectivo'&&sale.efectivo_recibido!=null?`<p>Efectivo recibido: ${money(sale.efectivo_recibido)}<br>Cambio: ${money(sale.cambio||0)}</p>`:'';
 const html=`<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#29221e;max-width:720px;margin:24px auto"><h1 style="color:#bc571d">NutriGalletas</h1><h2>Recibo interno #${sale.numero}</h2><p>${esc(sale.fecha)} · ${esc(sale.metodo_pago)}<br>Atendido por: ${esc(sale.vendedor)}</p><table cellpadding="10" style="border-collapse:collapse;width:100%;text-align:left"><thead><tr><th>Producto / lote</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead><tbody>${rows}</tbody></table><h2>Total: ${money(sale.total)}</h2>${cash}<p>Gracias por tu compra.<br>Documento de control interno, sin validez fiscal.</p></body></html>`;
 const lines=[`NutriGalletas - Recibo interno #${sale.numero}`,sale.fecha,`Pago: ${sale.metodo_pago}`,`Atendido por: ${sale.vendedor}`,'',...sale.detalles.flatMap(d=>[`${d.cantidad} x ${d.producto} - ${money(d.precio*d.cantidad)}`,`Lote: ${d.lote} - Vence: ${d.vencimiento}`]),'',`Total: ${money(sale.total)}`,...(sale.metodo_pago==='efectivo'&&sale.efectivo_recibido!=null?[`Efectivo recibido: ${money(sale.efectivo_recibido)}`,`Cambio: ${money(sale.cambio||0)}`]:[]),'Documento interno, sin validez fiscal.'];
 return {html,text:lines.join('\n'),lines};
}
type Deps={origin:string;configured:boolean;authorize:(token:string)=>Promise<string|null>;loadReceipt:(token:string,id:string)=>Promise<Receipt|null>;reserve:(id:string,user:string,email:string)=>Promise<string>;send:(email:string,sale:Receipt,content:ReturnType<typeof receiptContent>)=>Promise<string>;finish:(id:string,sent:boolean,provider?:string)=>Promise<void>};
export function createReceiptHandler(deps:Deps){return async(req:Request)=>{
 const headers={'Access-Control-Allow-Origin':deps.origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Content-Type':'application/json'};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(!deps.origin||req.headers.get('origin')!==deps.origin)return reply({error:'Origen no permitido.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'Método no permitido.'},405);
 try{
  const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');if(!token)return reply({error:'Inicia sesión para enviar el recibo.'},401);
  const uid=await deps.authorize(token);if(!uid)return reply({error:'Sesión no autorizada.'},403);
  const raw=await req.text();if(raw.length>4000)return reply({error:'Solicitud demasiado grande.'},413);
  const body=JSON.parse(raw);const email=String(body.destinatario||'').trim().toLowerCase();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.venta_id||'')||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply({error:'Venta o correo inválido.'},400);
  const sale=await deps.loadReceipt(token,body.venta_id);if(!sale)return reply({error:'No puedes enviar este recibo.'},403);
  if(!deps.configured)return reply({error:'Falta activar el correo de NutriGalletas. El administrador debe configurar Gmail en Supabase.'},503);
  let reservation:string;try{reservation=await deps.reserve(body.venta_id,uid,email);}catch{return reply({error:'No se pudo autorizar el envío. Revisa la actualización 004 o espera un minuto antes de reenviar.'},429);}
  let provider:string;
  try{provider=await deps.send(email,sale,receiptContent(sale));}catch{try{await deps.finish(reservation,false);}catch{}return reply({error:'El servidor de correo no aceptó el recibo. La venta permanece guardada.'},502);}
  try{await deps.finish(reservation,true,provider);}catch{/* SMTP already accepted the email; do not trigger duplicate retries. */}
  return reply({ok:true,estado:'aceptado'});
 }catch{return reply({error:'No se pudo procesar el envío del recibo.'},400);}
};}
