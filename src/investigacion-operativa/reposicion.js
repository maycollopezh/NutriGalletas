// CUÁNDO PEDIR: posición <= R. CUÁNTO: mínimo entre EOQ y restricciones.
// d: paquetes/día; L y V: días; stock, SS, capacidad y tránsito: paquetes.
import { Z } from './parametros.js';

/** Reserva manual o SS = ceil(z * s * sqrt(L)). */
export function safetyStock(parameters, deviation) {
  return parameters.seguridad_metodo === 'manual'
    ? parameters.stock_seguridad
    : Math.ceil(
        Z[String(parameters.nivel_servicio)] *
          deviation *
          Math.sqrt(parameters.plazo_entrega_dias),
      );
}

/** R = ceil(d*L + SS). */
export function reorderPoint(daily, leadTime, safety) {
  return Math.ceil(daily * leadTime + safety);
}

/** Cobertura del stock libre, sin contar productos aún en camino. */
export function stockCoverage(stock, daily) {
  return stock / daily;
}

/** Restricciones prácticas por producto, no optimización dinámica de perecederos. */
export function orderLimits(daily, position, eoq, capacity, shelfLife) {
  const capacityRoom = Math.max(0, Math.floor(capacity - position));
  const shelfRoom = Math.max(0, Math.floor(daily * shelfLife - position));
  return { capacityRoom, shelfRoom, feasible: Math.min(eoq, capacityRoom, shelfRoom) };
}
