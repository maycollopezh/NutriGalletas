// Coordinador del plan: datos, modelos matemáticos, advertencias y resultado.
import { availableStock, today } from '../domain/domain.js';
import { validateInventoryParameters } from './parametros.js';
import { aggregateDailySales, shiftInventoryDay, demandStatistics } from './demanda.js';
import { annualInventoryCost, economicOrderQuantity } from './eoq.js';
import { safetyStock, reorderPoint, stockCoverage, orderLimits } from './reposicion.js';

// Se conserva el contrato público anterior para consumidores y pruebas existentes.
export { inventoryDefaults, validateInventoryParameters } from './parametros.js';
export { aggregateDailySales, shiftInventoryDay } from './demanda.js';

export function inventoryPlan(data, product, p, day = today()) {
  const stock = availableStock(data, product.id, day);
  if (!p) return { producto_id: product.id, stock, configured: false, warnings: [] };
  validateInventoryParameters(p);
  const rows = data.demanda_inventario || aggregateDailySales(data, day);
  const { series, units, mean, deviation } = demandStatistics(
    rows,
    product.id,
    p.periodo_dias,
    day,
  );
  const daily = p.demanda_fuente === 'historico' ? mean : p.demanda_anual / 365;
  const annual = daily * 365,
    position = stock + p.unidades_en_camino;
  const warnings = [];
  const result = {
    producto_id: product.id,
    configured: true,
    stock,
    position,
    daily,
    annual,
    historyUnits: units,
    historyDays: series.length,
    activeDays: series.filter((v) => v > 0).length,
    deviation,
    warnings,
    parameters: p,
  };
  if (!daily)
    return {
      ...result,
      safety: null,
      reorder: null,
      eoq: null,
      coverage: null,
      suggested: 0,
      status: 'Sin demanda estimable',
      warnings: ['No hay ventas en el período. No se calculan EOQ ni días de cobertura.'],
    };
  const safety = safetyStock(p, deviation);
  const reorder = reorderPoint(daily, p.plazo_entrega_dias, safety);
  const { exact, eoq } = economicOrderQuantity(
    annual,
    p.costo_pedido,
    p.costo_mantenimiento_anual,
    safety,
  );
  const cost = (q) =>
    annualInventoryCost(q, annual, p.costo_pedido, p.costo_mantenimiento_anual, safety);
  const coverage = stockCoverage(stock, daily);
  const { capacityRoom, shelfRoom, feasible } = orderLimits(
    daily,
    position,
    eoq,
    p.capacidad_maxima,
    p.vida_util_dias,
  );
  const needsOrder = position <= reorder;
  const suggested = needsOrder ? feasible : 0;
  if (p.demanda_fuente === 'historico')
    warnings.push(
      `Promedio sobre ${p.periodo_dias} días calendario completos, incluidos días sin ventas. El día actual se excluye. Verifica que el historial cubra ese período.`,
    );
  if (p.seguridad_metodo === 'estadistico')
    warnings.push(
      'Reserva estadística: demanda diaria independiente, aproximación normal y plazo ' +
        'de entrega constante. El nivel de servicio es un objetivo, no una garantía.',
    );
  if (result.activeDays < 7 && p.demanda_fuente === 'historico')
    warnings.push('Pocos días con ventas: la estimación puede ser poco representativa.');
  if (safety > p.capacidad_maxima)
    warnings.push('La reserva supera la capacidad configurada. Revisa los parámetros.');
  if (stock > 0 && coverage < p.plazo_entrega_dias)
    warnings.push(
      'Las existencias actuales podrían agotarse antes del plazo de entrega.',
    );
  if (p.unidades_en_camino)
    warnings.push(
      'Los paquetes en camino son una declaración manual. Cada nueva recepción del producto descuenta esas unidades automáticamente, hasta cero.',
    );
  if (needsOrder && feasible < eoq)
    warnings.push(
      'La cantidad práctica está limitada por capacidad o vida útil. Puede no alcanzar el mínimo de costo del EOQ clásico.',
    );
  if (
    data.lotes_inventario.some(
      (l) =>
        l.producto_id === product.id &&
        l.cantidad_disponible > 0 &&
        l.fecha_vencimiento >= day &&
        l.fecha_vencimiento <= shiftInventoryDay(day, 15),
    )
  )
    warnings.push(
      'Existen lotes próximos a vencer. Revisa FEFO y el vencimiento antes de comprar.',
    );
  return {
    ...result,
    safety,
    reorder,
    exact,
    eoq,
    coverage,
    capacityRoom,
    shelfRoom,
    feasible,
    needsOrder,
    suggested,
    costAtEOQ: cost(eoq),
    costComparisons: [Math.max(1, Math.floor(eoq / 2)), eoq, eoq * 2].map((q) => ({
      quantity: q,
      cost: cost(q),
    })),
    status: needsOrder
      ? suggested
        ? 'Reponer'
        : 'Revisar capacidad o vida útil'
      : p.unidades_en_camino && stock <= reorder
        ? 'Pedido en camino'
        : 'Stock suficiente',
  };
}
