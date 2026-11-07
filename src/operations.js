import { assert, today, round } from './domain.js';
import { inventoryPlan } from './inventory.js';
export function cashSettlement(total,received) {
  const text=String(received??'').trim();
  if(!/^\d+(?:\.\d{1,2})?$/.test(text))return {valid:false,received:null,change:null,message:'Ingresa el efectivo recibido, con hasta dos decimales.'};
  const amount=Number(text);
  if(!Number.isFinite(amount)||amount<=0||amount>999999)return {valid:false,received:null,change:null,message:'El efectivo recibido debe estar entre Bs 0,01 y Bs 999.999.'};
  const difference=Math.round(amount*100)-Math.round(total*100);
  if(difference<0)return {valid:false,received:amount,change:null,message:'El efectivo recibido no cubre el total de la venta.'};
  return {valid:total>0,received:amount,change:difference/100,message:''};
}
export function saleLots(data,items,day=today()) {
 const totals=new Map();
 for(const item of items){assert(Number.isSafeInteger(item.cantidad)&&item.cantidad>0,'Cantidad inválida.');totals.set(item.producto_id,(totals.get(item.producto_id)||0)+item.cantidad);}
 const result=[];
 for(const [productId,quantity] of totals){
  let remaining=quantity;
  const lots=data.lotes_inventario.filter(l=>l.producto_id===productId&&l.fecha_vencimiento>=day&&l.cantidad_disponible>0).sort((a,b)=>a.fecha_vencimiento.localeCompare(b.fecha_vencimiento)||a.id.localeCompare(b.id));
  for(const lot of lots){if(!remaining)break;const count=Math.min(remaining,lot.cantidad_disponible);result.push({producto_id:productId,lote_id:lot.id,codigo_lote:lot.codigo_lote||'Lote registrado',fecha_vencimiento:lot.fecha_vencimiento,cantidad:count});remaining-=count;}
  assert(!remaining,'Las existencias cambiaron. Revisa las cantidades antes de confirmar.');
 }
 return result;
}
export function replenishment(data,product,day=today()) {
 const summary=data.resumen_inventario?.find(p=>p.producto_id===product.id);
 if(summary)return {configured:summary.configurado,minimum:summary.minimo_reposicion==null?null:Number(summary.minimo_reposicion),daily:summary.demanda_diaria==null?null:Number(summary.demanda_diaria),source:summary.demanda_fuente,days:summary.periodo_dias,safety:summary.reserva==null?null:Number(summary.reserva),needsOrder:!!summary.reponer,pending:Number(summary.unidades_en_camino||0)};
 const parameter=data.parametros_inventario?.find(p=>p.producto_id===product.id);
 if(!parameter)return {configured:false,minimum:null,daily:null,source:null,needsOrder:false,pending:0};
 const p=inventoryPlan(data,product,parameter,day);
 return {configured:p.configured,minimum:p.reorder??null,daily:p.daily??null,source:parameter.demanda_fuente,days:parameter.periodo_dias,safety:p.safety??null,needsOrder:!!p.needsOrder,pending:parameter.unidades_en_camino};
}
export function validReceiptEmail(value){const text=String(value||'').trim().toLowerCase();assert(text.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text),'Ingresa un correo válido.');return text;}
