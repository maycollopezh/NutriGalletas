// Adaptador de texto para IA. Los cálculos viven en src/investigacion-operativa/.
import { economicOrderQuantity } from '../../../../src/investigacion-operativa/eoq.js';
import { orderLimits } from '../../../../src/investigacion-operativa/reposicion.js';

export function orderAdvice(daily, stock, p, reorder) {
  if (
    !p ||
    daily <= 0 ||
    Number(p.costo_pedido) <= 0 ||
    Number(p.costo_mantenimiento_anual) <= 0
  )
    return '';
  const { eoq } = economicOrderQuantity(
    daily * 365,
    Number(p.costo_pedido),
    Number(p.costo_mantenimiento_anual),
  );
  const position = stock + Number(p.unidades_en_camino || 0);
  const { feasible } = orderLimits(
    daily,
    position,
    eoq,
    Number(p.capacidad_maxima),
    Number(p.vida_util_dias),
  );
  return ` · pedido económico teórico ${eoq} · compra sugerida ${position <= reorder ? feasible : 0} paquetes (capacidad y vida útil consideradas)`;
}
