// MODELO EOQ: Q* = sqrt(2 D S / H).
// D: paquetes/año; S: Bs/pedido; H: Bs/paquete/año; SS: paquetes.
// Funciones puras compartidas por la planificación web y el asistente.

/** Costo anual relevante: pedir + mantener. No incluye D*c. */
export function annualInventoryCost(
  quantity,
  annualDemand,
  orderCost,
  holdingCost,
  safety = 0,
) {
  return (annualDemand / quantity) * orderCost + (quantity / 2 + safety) * holdingCost;
}

/** Compara piso y techo del EOQ continuo para pedir paquetes enteros. */
export function economicOrderQuantity(annualDemand, orderCost, holdingCost, safety = 0) {
  const exact = Math.sqrt((2 * annualDemand * orderCost) / holdingCost);
  const lower = Math.max(1, Math.floor(exact));
  const upper = Math.max(1, Math.ceil(exact));
  const cost = (q) =>
    annualInventoryCost(q, annualDemand, orderCost, holdingCost, safety);
  return { exact, eoq: cost(lower) < cost(upper) ? lower : upper };
}
