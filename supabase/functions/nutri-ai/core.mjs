export const zone='America/La_Paz';
export const day=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export const money=n=>'Bs '+Number(n||0).toFixed(2).replace('.',',');
export const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
export const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function resolveEntity(query,rows,label){
 const q=normalize(query);if(!q)throw Error(`¿Qué ${label} quieres usar?`);
 const exact=rows.filter(r=>[r.id,r.codigo,r.nombre].some(v=>normalize(v)===q));
 const matches=exact.length?exact:rows.filter(r=>normalize(r.nombre).includes(q)||q.split(/\s+/).filter(Boolean).every(w=>normalize(r.nombre).includes(w)));
 if(matches.length!==1)throw Error(matches.length?`Hay varias opciones de ${label}: ${matches.map(r=>r.nombre).join(', ')}. Indica el nombre completo.`:`No encontré ese ${label}. Opciones: ${rows.map(r=>r.nombre).join(', ')}.`);
 return matches[0];
}
export function period(intent,now=new Date()){
 const today=day(now);const from=intent.desde||today;const to=intent.hasta||today;
 if(!validDay(from)||!validDay(to)||from>to||to>today||new Date(to)-new Date(from)>365*86400000)throw Error('Indica un rango válido de hasta un año y sin fechas futuras.');
 return {desde:from,hasta:to===today?now.toISOString():`${to}T23:59:59.999-04:00`};
}
function number(value,label,integer=false){if(value===null||value===''||!Number.isFinite(Number(value))||Number(value)<=0||Number(value)>999999||(!integer&&Math.abs(Math.round(Number(value)*100)-Number(value)*100)>1e-7)||(integer&&!Number.isSafeInteger(Number(value))))throw Error(`Indica ${label} válido${integer?' (entero)':''}.`);return Number(value);}
export function prepareDraft(i,catalog,now=new Date()){
 const type=i.accion;let data,summary;
 if(type==='venta'){
  if(!i.items?.length)throw Error('¿Qué producto y cuántos paquetes vas a vender?');
  const items=i.items.map(x=>{const p=resolveEntity(x.producto,catalog.productos,'producto');return {producto_id:p.id,nombre:p.nombre,cantidad:number(x.cantidad,'una cantidad',true),precio:Number(p.precio_venta)};});
  const grouped=new Map();for(const item of items)grouped.set(item.producto_id,(grouped.get(item.producto_id)||0)+item.cantidad);
  const allocation=[];for(const [productId,quantity] of grouped){const product=catalog.productos.find(p=>p.id===productId);if(Array.isArray(product.lotes)){let remaining=quantity;for(const lot of product.lotes){const taken=Math.min(remaining,Number(lot.cantidad));if(taken>0){allocation.push(`${product.nombre}: lote ${lot.codigo} · ${taken} paquetes · vence ${lot.vence}`);remaining-=taken;}}if(remaining>0)throw Error(`No hay suficientes paquetes vigentes de ${product.nombre}.`);}}
  const total=Math.round(items.reduce((s,x)=>s+x.cantidad*x.precio,0)*100)/100;
  if(!['efectivo','qr','tarjeta'].includes(i.metodo_pago))throw Error('¿Se paga en efectivo, QR o tarjeta?');
  const received=i.metodo_pago==='efectivo'?number(i.efectivo_recibido,'el efectivo recibido'):null;
  if(received!==null&&received<total)throw Error(`El total es ${money(total)}. ¿Cuánto efectivo entregó el cliente?`);
  if(i.correo_cliente&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.correo_cliente))throw Error('El correo del cliente no es válido.');
  data={items,metodo_pago:i.metodo_pago,efectivo_recibido:received,correo_cliente:i.correo_cliente||null,pago_verificado:false};
  summary=`VENTA\n${items.map(x=>`${x.cantidad} × ${x.nombre} a ${money(x.precio)}`).join('\n')}${allocation.length?'\nLotes previstos (se revisan otra vez al confirmar):\n'+allocation.join('\n'):''}\nTotal: ${money(total)} · ${i.metodo_pago}${received!==null?`\nRecibido: ${money(received)} · Vuelto: ${money(received-total)}`:''}${i.correo_cliente?'\nEnviar recibo a: '+i.correo_cliente:''}${i.metodo_pago==='qr'?'\nConfirma solo después de comprobar el abono en tu banco.':''}`;
 }else if(type==='compra'){
  if(i.items?.length!==1)throw Error('Recibimos un producto por compra. Indica el producto, cantidad, costo por paquete, proveedor, lote y vencimiento.');
  const p=resolveEntity(i.items[0].producto,catalog.productos,'producto'),supplier=resolveEntity(i.proveedor,catalog.proveedores,'proveedor');
  const quantity=number(i.items[0].cantidad,'una cantidad',true),cost=number(i.costo_unitario,'el costo por paquete');
  if(quantity>100000)throw Error('La cantidad máxima es 100000 paquetes.');
  if(!i.codigo_lote?.trim()||i.codigo_lote.length>160)throw Error('¿Cuál es el código impreso en el lote?');
  if(!validDay(i.fecha)||i.fecha<day(now))throw Error('¿Qué fecha de vencimiento tiene el lote? Usa una fecha vigente.');
  data={producto_id:p.id,proveedor_id:supplier.id,cantidad:quantity,costo_unitario:cost,codigo_lote:i.codigo_lote.trim(),fecha_vencimiento:i.fecha,observacion:i.nota||''};
  summary=`COMPRA RECIBIDA\n${supplier.nombre}\n${quantity} × ${p.nombre} a ${money(cost)}\nLote: ${i.codigo_lote} · vence ${i.fecha}\nTotal: ${money(quantity*cost)}\nEsto registra mercadería ya recibida, no encarga un pedido al proveedor.`;
 }else if(type==='gasto'){
  if(!i.concepto||i.concepto.trim().length<2||i.concepto.length>160)throw Error('¿En qué se gastó el dinero?');
  if(!i.categoria||i.categoria.length>160)throw Error('¿Qué categoría tiene el gasto?');
  const value=number(i.monto,'el monto'); const date=i.fecha||day(now);
  if(!validDay(date)||date>day(now))throw Error('Indica la fecha del gasto, sin fechas futuras.');
  data={concepto:i.concepto,categoria:i.categoria,monto:value,fecha:date,observacion:i.nota||''};summary=`GASTO\n${i.concepto} · ${i.categoria}\n${money(value)} · ${date}`;
 }else if(type==='recordatorio'){
  const at=i.fecha;if(!at||!/(Z|[+-]\d\d:\d\d)$/.test(at)||!Number.isFinite(Date.parse(at))||new Date(at)<=now)throw Error('¿Qué día y hora de Bolivia quieres el recordatorio?');
  if(!i.concepto||i.concepto.length>500)throw Error('¿Qué necesitas recordar?');
  data={texto:i.concepto,fecha:at};summary=`RECORDATORIO\n${i.concepto}\n${new Date(at).toLocaleString('es-BO',{timeZone:zone})}`;
 }else throw Error('Operación no admitida.');
 return {tipo:type,datos:data,resumen:summary};
}
export function orderAdvice(daily,stock,p,reorder){
 if(!p||daily<=0||Number(p.costo_pedido)<=0||Number(p.costo_mantenimiento_anual)<=0)return '';
 const annual=daily*365,S=Number(p.costo_pedido),H=Number(p.costo_mantenimiento_anual),exact=Math.sqrt(2*annual*S/H);
 const lower=Math.max(1,Math.floor(exact)),upper=Math.max(1,Math.ceil(exact));
 const cost=q=>annual/q*S+q/2*H;const eoq=cost(lower)<cost(upper)?lower:upper;
 const position=stock+Number(p.unidades_en_camino||0);
 const feasible=Math.max(0,Math.min(eoq,Math.floor(Number(p.capacidad_maxima)-position),Math.floor(daily*Number(p.vida_util_dias)-position)));
 return ` · pedido económico teórico ${eoq} · compra sugerida ${position<=reorder?feasible:0} paquetes (capacidad y vida útil consideradas)`;
}
export function formatReport(r,kind='finanzas',today=day()){
 const names=new Map((r.rendimiento||[]).map(x=>[x.id,x.nombre]));
 if(kind==='finanzas')return `Del ${day(new Date(r.desde))} al ${new Date(r.hasta).toLocaleString('es-BO',{timeZone:zone})}\nIngresos: ${money(r.ingreso)}\nCosto histórico de lo vendido: ${money(r.costo_historico)}\nGanancia bruta: ${money(r.ganancia_bruta)}\nGastos: ${money(r.gastos)}\nResultado neto estimado: ${money(r.resultado_neto_estimado)}\n${r.ventas} ventas. El costo histórico corresponde a los lotes vendidos; las compras de inventario no se descuentan otra vez. El resultado es interno y no incluye conceptos que no se hayan registrado.`;
 if(kind==='ventas')return 'Productos vendidos en el período:\n'+r.rendimiento.map(p=>`${p.nombre}: ${p.unidades} paquetes · ${money(p.ingreso)}`).join('\n');
 if(kind==='margenes')return 'Margen bruto sobre ventas (no recargo sobre costo):\n'+r.rendimiento.map(p=>`${p.nombre}: ${Number(p.ingreso)>0?((Number(p.ingreso)-Number(p.costo_historico))/Number(p.ingreso)*100).toFixed(1)+'%':'sin ventas en el período'}`).join('\n')+'\nLa meta de margen depende de tu negocio; un 33% no equivale a un recargo de 33%.';
 if(kind==='estancados')return 'Última venta por producto (sin venta o más de 30 días):\n'+(r.rendimiento.filter(p=>!p.ultima_venta||new Date(today)-new Date(p.ultima_venta)>30*86400000).map(p=>`${p.nombre}: ${p.ultima_venta?day(new Date(p.ultima_venta)):'sin ventas registradas'}`).join('\n')||'No hay productos estancados con ese criterio.');
 if(kind==='vencimientos')return 'Lotes vencidos o por vencer en 15 días:\n'+(r.lotes.filter(l=>new Date(l.vence)-new Date(today)<=15*86400000).map(l=>`${l.producto} · ${l.lote}: ${l.cantidad} paquetes · ${l.vence}${l.vence<today?' (vencido, no vender)':''}`).join('\n')||'No hay lotes próximos a vencer.');
 return 'Inventario y reposición:\n'+r.inventario.filter(p=>names.has(p.producto_id)).map(p=>{const lots=r.lotes.filter(l=>l.producto===names.get(p.producto_id)&&l.vence>=today);const params=(r.parametros||[]).find(x=>x.producto_id===p.producto_id);const available=lots.reduce((s,l)=>s+Number(l.cantidad),0),daily=Number(p.demanda_diaria);return `${names.get(p.producto_id)||p.producto_id}: ${available} disponibles · demanda ${daily.toFixed(2)}/día · mínimo ${p.minimo_reposicion??'sin estimación'} · cobertura ${daily>0?(available/daily).toFixed(1)+' días':'sin estimación'}${orderAdvice(daily,available,params,p.minimo_reposicion)}${p.reponer?' · REPONER':''}`;}).join('\n')+'\nCobertura estimada según ventas previas; no es una fecha garantizada de agotamiento.';
}
const nullableString={type:['string','null']};const nullableNumber={type:['number','null']};
export const intentTool={type:'function',name:'interpretar',description:'Extrae una consulta u operación. Nunca confirma ni ejecuta; si faltan datos usa null. Las fechas son de Bolivia.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{accion:{type:'string',enum:['consulta','venta','compra','gasto','recordatorio','ayuda','humano']},tema:{type:'string',enum:['finanzas','inventario','vencimientos','ventas','estancados','margenes']},desde:nullableString,hasta:nullableString,comparar_desde:nullableString,comparar_hasta:nullableString,items:{type:'array',items:{type:'object',additionalProperties:false,properties:{producto:{type:'string'},cantidad:nullableNumber},required:['producto','cantidad']}},metodo_pago:nullableString,efectivo_recibido:nullableNumber,correo_cliente:nullableString,proveedor:nullableString,costo_unitario:nullableNumber,codigo_lote:nullableString,fecha:nullableString,concepto:nullableString,categoria:nullableString,monto:nullableNumber,nota:nullableString},required:['accion','tema','desde','hasta','comparar_desde','comparar_hasta','items','metodo_pago','efectivo_recibido','correo_cliente','proveedor','costo_unitario','codigo_lote','fecha','concepto','categoria','monto','nota']}};
