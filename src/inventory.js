import { assert, availableStock, today } from './domain.js';

const Z = { '0.9': 1.281551566, '0.95': 1.644853627, '0.975': 1.959963985, '0.99': 2.326347874 };
export const inventoryDefaults = () => ({ demanda_fuente: 'manual', demanda_anual: 1460, periodo_dias: 30, costo_pedido: 20, costo_mantenimiento_anual: 2, plazo_entrega_dias: 3, seguridad_metodo: 'manual', stock_seguridad: 6, nivel_servicio: 0.95, vida_util_dias: 60, capacidad_maxima: 300, unidades_en_camino: 0, supuestos: 'Ejemplo académico ficticio. Revisar demanda, costos, capacidad y vida útil antes de utilizar.' });
export function validateInventoryParameters(p) {
  assert(['manual', 'historico'].includes(p.demanda_fuente), 'Selecciona el origen de la demanda.');
  assert(['manual', 'estadistico'].includes(p.seguridad_metodo), 'Selecciona el método de seguridad.');
  for (const [key, label, min, max] of [
    ['demanda_anual', 'Demanda anual', 0.01, 36500000], ['costo_pedido', 'Costo por pedido', 0.01, 999999], ['costo_mantenimiento_anual', 'Mantenimiento anual por paquete', 0.01, 999999],
  ]) assert(Number.isFinite(p[key]) && p[key] >= min && p[key] <= max, `${label}: valor entre ${min} y ${max}.`);
  for (const [key, label, min, max] of [
    ['periodo_dias', 'Período histórico', 7, 365], ['plazo_entrega_dias', 'Plazo de entrega', 1, 365], ['stock_seguridad', 'Reserva manual', 0, 100000], ['vida_util_dias', 'Vida útil al recibir', 1, 3650], ['capacidad_maxima', 'Capacidad máxima', 1, 100000], ['unidades_en_camino', 'Paquetes en camino', 0, 100000],
  ]) assert(Number.isSafeInteger(p[key]) && p[key] >= min && p[key] <= max, `${label}: entero entre ${min} y ${max}.`);
  assert(Object.hasOwn(Z, String(p.nivel_servicio)), 'Nivel de servicio inválido.');
  assert(p.seguridad_metodo !== 'estadistico' || p.demanda_fuente === 'historico', 'La seguridad estadística requiere demanda histórica.');
  assert(typeof p.supuestos === 'string' && p.supuestos.trim().length >= 10 && p.supuestos.length <= 500, 'Describe los supuestos utilizados (10 a 500 caracteres).');
  return p;
}
export function shiftInventoryDay(day, amount) {
  const date = new Date(day + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10);
}
export function aggregateDailySales(data, day = today()) {
  const sales = new Map(data.ventas.map(v => [v.id, new Intl.DateTimeFormat('en-CA', {timeZone:'America/La_Paz',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v.fecha))]));
  const rows = new Map(); const first = shiftInventoryDay(day, -365);
  for (const item of data.detalle_ventas) {
    const date = sales.get(item.venta_id); if (!date || date < first || date >= day) continue;
    const key = item.producto_id + ':' + date;
    const row = rows.get(key) || { producto_id: item.producto_id, fecha: date, cantidad: 0 };
    row.cantidad += Number(item.cantidad); rows.set(key, row);
  }
  return [...rows.values()];
}
export function inventoryPlan(data, product, p, day = today()) {
  const stock = availableStock(data, product.id, day);
  if (!p) return { producto_id: product.id, stock, configured: false, warnings: [] };
  validateInventoryParameters(p);
  const rows = data.demanda_inventario || aggregateDailySales(data, day);
  const dates = new Map(rows.filter(r => r.producto_id === product.id).map(r => [r.fecha, Number(r.cantidad)]));
  const series = Array.from({length:p.periodo_dias},(_,i)=>dates.get(shiftInventoryDay(day, -p.periodo_dias + i)) || 0);
  const units = series.reduce((a,b)=>a+b,0), mean = units / series.length;
  const deviation = Math.sqrt(series.reduce((n,v)=>n+(v-mean)**2,0)/(series.length-1));
  const daily = p.demanda_fuente === 'historico' ? mean : p.demanda_anual / 365;
  const annual = daily * 365, position = stock + p.unidades_en_camino;
  const warnings = [];
  const result = { producto_id: product.id, configured:true, stock, position, daily, annual, historyUnits:units, historyDays:series.length, activeDays:series.filter(v=>v>0).length, deviation, warnings, parameters:p };
  if (!daily) return {...result, safety:null, reorder:null, eoq:null, coverage:null, suggested:0, status:'Sin demanda estimable', warnings:['No hay ventas en el período. No se calculan EOQ ni días de cobertura.']};
  const safety = p.seguridad_metodo === 'manual' ? p.stock_seguridad : Math.ceil(Z[String(p.nivel_servicio)] * deviation * Math.sqrt(p.plazo_entrega_dias));
  const reorder = Math.ceil(daily * p.plazo_entrega_dias + safety);
  const exact = Math.sqrt(2 * annual * p.costo_pedido / p.costo_mantenimiento_anual);
  const cost = q => annual/q*p.costo_pedido + (q/2+safety)*p.costo_mantenimiento_anual;
  const lower = Math.max(1,Math.floor(exact)), upper = Math.max(1,Math.ceil(exact));
  const eoq = cost(lower) < cost(upper) ? lower : upper;
  const coverage = stock/daily;
  const capacityRoom = Math.max(0,Math.floor(p.capacidad_maxima-position));
  const shelfRoom = Math.max(0,Math.floor(daily*p.vida_util_dias-position));
  const feasible = Math.min(eoq,capacityRoom,shelfRoom);
  const needsOrder = position <= reorder;
  const suggested = needsOrder ? feasible : 0;
  if (p.demanda_fuente === 'historico') warnings.push(`Promedio sobre ${p.periodo_dias} días calendario completos, incluidos días sin ventas. El día actual se excluye. Verifica que el historial cubra ese período.`);
  if (p.seguridad_metodo === 'estadistico') warnings.push('Reserva estadística: demanda diaria independiente, aproximación normal y plazo de entrega constante. El nivel de servicio es un objetivo, no una garantía.');
  if (result.activeDays < 7 && p.demanda_fuente === 'historico') warnings.push('Pocos días con ventas: la estimación puede ser poco representativa.');
  if (safety > p.capacidad_maxima) warnings.push('La reserva supera la capacidad configurada. Revisa los parámetros.');
  if (stock > 0 && coverage < p.plazo_entrega_dias) warnings.push('Las existencias actuales podrían agotarse antes del plazo de entrega.');
  if (p.unidades_en_camino) warnings.push('Los paquetes en camino son una declaración manual. Cada nueva recepción del producto descuenta esas unidades automáticamente, hasta cero.');
  if (needsOrder && feasible < eoq) warnings.push('La cantidad práctica está limitada por capacidad o vida útil. Puede no alcanzar el mínimo de costo del EOQ clásico.');
  if (data.lotes_inventario.some(l=>l.producto_id===product.id && l.cantidad_disponible>0 && l.fecha_vencimiento>=day && l.fecha_vencimiento<=shiftInventoryDay(day,15))) warnings.push('Existen lotes próximos a vencer. Revisa FEFO y el vencimiento antes de comprar.');
  return {...result, safety, reorder, exact, eoq, coverage, capacityRoom, shelfRoom, feasible, needsOrder, suggested, costAtEOQ:cost(eoq), costComparisons:[Math.max(1,Math.floor(eoq/2)),eoq,eoq*2].map(q=>({quantity:q,cost:cost(q)})), status: needsOrder ? (suggested ? 'Reponer' : 'Revisar capacidad o vida útil') : (p.unidades_en_camino && stock<=reorder ? 'Pedido en camino' : 'Stock suficiente')};
}
