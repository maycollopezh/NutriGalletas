// Único mínimo visible por producto: punto de pedido calculado, nunca el legado SQL.
// Se recalcula en cada carga. No se persiste, para no quedar desactualizado con la fecha.
import { replenishment } from '../domain/operations.js';

export function withAutomaticMinimum(data) {
  return {
    ...data,
    productos: data.productos.map((product) => ({
      ...product,
      stock_minimo: replenishment(data, product).minimum,
    })),
  };
}
