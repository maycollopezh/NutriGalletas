import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import nodemailer from 'npm:nodemailer@10.3.1';
import {PDFDocument,StandardFonts,rgb} from 'npm:pdf-lib@1.17.1';
import {Buffer} from 'node:buffer';
import {createReceiptHandler,type Receipt} from './handler.ts';
const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin=createClient(url,service,{auth:{persistSession:false}});
const caller=(token:string)=>createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
const smtpUser=(Deno.env.get('RECEIPT_GMAIL_USER')||'').trim(),smtpPassword=(Deno.env.get('RECEIPT_GMAIL_APP_PASSWORD')||'').replace(/\s/g,'');
const transport=smtpUser&&smtpPassword?nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user:smtpUser,pass:smtpPassword},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,logger:false,debug:false}):null;
Deno.serve(createReceiptHandler({
 origin:Deno.env.get('APP_ORIGIN')||'',configured:!!transport,
 async authorize(token){const verified=await admin.auth.getUser(token);if(verified.error||!verified.data.user)return null;const role=await caller(token).rpc('rol_actual');return ['administrador','cajero'].includes(role.data)?verified.data.user.id:null;},
 async loadReceipt(token,id){
  const client=caller(token),sale=await client.from('ventas').select('id,numero,usuario_id,fecha,metodo_pago,total,efectivo_recibido,cambio').eq('id',id).maybeSingle();
  if(sale.error||!sale.data)return null;
  const [details,products,lots,seller]=await Promise.all([client.from('detalle_ventas').select('producto_id,lote_id,cantidad,precio_unitario').eq('venta_id',id),client.from('productos').select('id,nombre'),client.rpc('consultar_lotes_venta'),client.from('perfiles_usuarios').select('nombre').eq('id',sale.data.usuario_id).maybeSingle()]);
  if(details.error||products.error||lots.error)return null;
  return {...sale.data,fecha:new Intl.DateTimeFormat('es-BO',{timeZone:'America/La_Paz',dateStyle:'medium',timeStyle:'short'}).format(new Date(sale.data.fecha)),vendedor:seller.data?.nombre||'Personal de NutriGalletas',detalles:details.data.map(d=>{const lot=lots.data.find((l:{id:string})=>l.id===d.lote_id);return {producto:products.data.find(p=>p.id===d.producto_id)?.nombre||'Producto',lote:lot?.codigo_lote||'Registrado',vencimiento:lot?.fecha_vencimiento||'Registrado',cantidad:d.cantidad,precio:d.precio_unitario};})} as Receipt;
 },
 async reserve(id,user,email){const result=await admin.rpc('reservar_envio_recibo',{p_venta_id:id,p_usuario_id:user,p_destinatario:email});if(result.error)throw result.error;return result.data;},
 async finish(id,sent,provider){const result=await admin.rpc('finalizar_envio_recibo',{p_envio_id:id,p_enviado:sent,p_proveedor_id:provider||null});if(result.error)throw result.error;},
 async send(email,sale,content){
  if(!transport)throw new Error('Correo no configurado');
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);let page=pdf.addPage([595,842]),y=790;
  const safe=(s:string)=>s.replace(/\u00a0/g,' ').replace(/[^\x20-\x7e\u00a0-\u00ff]/g,'-');
  for(const raw of content.lines){const line=safe(raw);for(let offset=0;offset<Math.max(line.length,1);offset+=88){if(y<55){page=pdf.addPage([595,842]);y=790;}page.drawText(line.slice(offset,offset+88),{x:42,y,size:11,font,color:rgb(.16,.12,.09)});y-=17;}}
  const message=await transport.sendMail({from:{name:'NutriGalletas',address:smtpUser},to:email,subject:`Tu recibo NutriGalletas #${sale.numero}`,text:content.text,html:content.html,attachments:[{filename:`Recibo-NutriGalletas-${sale.numero}.pdf`,content:Buffer.from(await pdf.save()),contentType:'application/pdf'}]});
  if(!message.accepted?.length)throw new Error('Correo rechazado');return message.messageId;
 }
}));
