const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let currentUser,connection,rows=[],pending=null,busy=false,human=false,loaded=false,notice='',whatsapp=[];
export function assistantView(store,user){
 if(user?.rol!=='administrador')return '';
 if(currentUser!==user.id){currentUser=user.id;rows=[];pending=null;human=false;loaded=false;notice='';whatsapp=[];}
 connection=store;
 if(!loaded&&store.client){loaded=true;queueMicrotask(()=>request({action:'estado'}));}
 return `<section id="assistant-panel" class="assistant-layout"><div class="panel assistant-chat"><div class="panel-head"><div><span class="eyebrow">TU ASISTENTE</span><h1>Tu tienda, más fácil</h1><p>Pregunta, revisa y decide. Tú confirmas cada registro.</p></div><span class="badge ${human?'warn':''}">${human?'Atención humana':'Solo administrador'}</span></div><div class="assistant-messages" aria-live="polite">${rows.length?rows.map(r=>`<article class="assistant-bubble ${r.role==='user'?'mine':''}"><small>${r.role==='user'?'Tú':'NutriGalletas'}</small><p>${escape(r.content)}</p></article>`).join(''):'<div class="assistant-welcome"><h2>¿Qué necesitas revisar hoy?</h2><p>Consulta tus ganancias, las galletas que más se venden o qué conviene reponer.</p></div>'}${busy?'<p role="status">Revisando tu solicitud…</p>':''}</div>${pending?`<div class="assistant-confirm"><strong>Revisa antes de guardar</strong><p>${escape(pending.resumen)}</p><small>Vence: ${new Date(pending.vence_en).toLocaleTimeString('es-BO',{timeZone:'America/La_Paz'})}</small>${pending.qr?'<label class="assistant-qr-check"><input id="assistant-qr-verified" type="checkbox"> Comprobé el abono QR en mi banco.</label>':''}<div class="toolbar"><button class="primary" data-ai="confirmar" ${busy?'disabled':''}>Confirmar registro</button><button data-ai="cancelar" ${busy?'disabled':''}>Cancelar</button></div></div>`:''}${notice?`<p class="form-error" role="alert">${escape(notice)}</p>`:''}<form id="assistant-form"><label class="sr-only" for="assistant-message">Mensaje</label><textarea id="assistant-message" name="message" maxlength="2000" required rows="2" placeholder="Ej. ¿Cuánto ganamos ayer?" ${busy||human||!store.client?'disabled':''}></textarea><button class="primary" ${busy||human||!store.client?'disabled':''}>Enviar</button></form>${!store.client?'<p class="inline-help">El asistente necesita una sesión de Supabase. No registra operaciones en demostración.</p>':''}</div><aside class="assistant-guide"><section class="panel"><h2>Empieza con una pregunta</h2>${['¿Cuánto vendimos ayer?','¿Qué productos debo reponer?','¿Qué lotes vencen en 15 días?','¿Cuáles fueron los más vendidos esta semana?','Revisa nuestros márgenes de ganancia'].map(s=>`<button class="assistant-suggestion" data-ai="suggest" data-message="${escape(s)}">${escape(s)} <span>↗</span></button>`).join('')}</section><section class="panel"><h2>También puedo ayudarte a registrar</h2><p>Ventas con vuelto, compras recibidas, gastos y recordatorios.</p><p>Te pediré los datos que falten y mostraré un resumen antes de guardar.</p><button data-ai="${human?'reanudar':'humano'}">${human?'Reanudar asistente':'Pausar para atención humana'}</button><button class="text-button" data-ai="estado">Actualizar conversación</button></section>${whatsapp.length?'<section class="panel"><h2>Últimos mensajes de WhatsApp</h2>'+whatsapp.map(r=>'<p><small>'+escape(r.role==='user'?'Administrador':'Asistente')+'</small><br>'+escape(r.content)+'</p>').join('')+'</section>':''}<section class="panel"><h2>Tus avisos</h2><p>Alertas diarias: 08:00.</p><p>Reporte PDF: domingos, 20:00.</p><small>Hora de Bolivia. Los envíos requieren la conexión de WhatsApp y correo activada.</small></section></aside></section>`;
}
function paint(){const element=document.querySelector('#assistant-panel');if(!element||!connection?.user)return;element.outerHTML=assistantView(connection,connection.user);document.querySelector('.assistant-messages')?.scrollTo({top:999999});}
async function request(body){
 if(busy||!connection?.client)return;
 busy=true;notice='';paint();
 try{
  const {data,error}=await connection.client.functions.invoke('nutri-ai/webchat',{body:{message:'',eventId:crypto.randomUUID(),...body}});
  if(error){let message='No se pudo conectar el asistente. Revisa que esté activado en Supabase.';try{message=(await error.context.json()).error||message;}catch{}throw Error(message);}
  if(data.error)throw Error(data.error);
  if(body.action==='estado'){rows=data.historial||[];whatsapp=data.whatsapp_historial||[];human=data.estado!=='bot';pending=data.pendientes?.at(-1)||null;}
  else{if(data.reply)rows.push({role:'assistant',content:data.reply});if(data.pending)pending=data.pending;if(['confirmar','cancelar'].includes(body.action))pending=null;if(body.action==='humano')human=true;if(body.action==='reanudar')human=false;}
 }catch(e){notice=e.message;}finally{busy=false;paint();}
}
document.addEventListener('submit',event=>{
 if(event.target.id!=='assistant-form')return;event.preventDefault();event.stopImmediatePropagation();
 const text=event.target.elements.message.value.trim();if(!text||busy)return;
 rows.push({role:'user',content:text});request({message:text});
},true);
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-ai]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();
 const action=button.dataset.ai;if(action==='suggest'){const input=document.querySelector('#assistant-message');if(input){input.value=button.dataset.message;input.focus();}return;}
 if(action==='confirmar'&&pending?.qr&&!document.querySelector('#assistant-qr-verified')?.checked){notice='Comprueba el abono QR y marca la casilla antes de confirmar.';paint();return;}
 request({action,id:pending?.id,verified:document.querySelector('#assistant-qr-verified')?.checked===true});
},true);
