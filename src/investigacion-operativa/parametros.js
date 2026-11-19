// Parámetros, unidades y validaciones de los modelos de inventario.
import { assert } from '../domain/domain.js';

export const Z = {
  0.9: 1.281551566,
  0.95: 1.644853627,
  0.975: 1.959963985,
  0.99: 2.326347874,
};
export const inventoryDefaults = () => ({
  demanda_fuente: 'manual',
  demanda_anual: 1460,
  periodo_dias: 30,
  costo_pedido: 20,
  costo_mantenimiento_anual: 2,
  plazo_entrega_dias: 3,
  seguridad_metodo: 'manual',
  stock_seguridad: 6,
  nivel_servicio: 0.95,
  vida_util_dias: 60,
  capacidad_maxima: 300,
  unidades_en_camino: 0,
  supuestos:
    'Ejemplo académico ficticio. Revisar demanda, costos, capacidad y vida útil antes de utilizar.',
});
export function validateInventoryParameters(p) {
  assert(
    ['manual', 'historico'].includes(p.demanda_fuente),
    'Selecciona el origen de la demanda.',
  );
  assert(
    ['manual', 'estadistico'].includes(p.seguridad_metodo),
    'Selecciona el método de seguridad.',
  );
  for (const [key, label, min, max] of [
    ['demanda_anual', 'Demanda anual', 0.01, 36500000],
    ['costo_pedido', 'Costo por pedido', 0.01, 999999],
    ['costo_mantenimiento_anual', 'Mantenimiento anual por paquete', 0.01, 999999],
  ])
    assert(
      Number.isFinite(p[key]) && p[key] >= min && p[key] <= max,
      `${label}: valor entre ${min} y ${max}.`,
    );
  for (const [key, label, min, max] of [
    ['periodo_dias', 'Período histórico', 7, 365],
    ['plazo_entrega_dias', 'Plazo de entrega', 1, 365],
    ['stock_seguridad', 'Reserva manual', 0, 100000],
    ['vida_util_dias', 'Vida útil al recibir', 1, 3650],
    ['capacidad_maxima', 'Capacidad máxima', 1, 100000],
    ['unidades_en_camino', 'Paquetes en camino', 0, 100000],
  ])
    assert(
      Number.isSafeInteger(p[key]) && p[key] >= min && p[key] <= max,
      `${label}: entero entre ${min} y ${max}.`,
    );
  assert(Object.hasOwn(Z, String(p.nivel_servicio)), 'Nivel de servicio inválido.');
  assert(
    p.seguridad_metodo !== 'estadistico' || p.demanda_fuente === 'historico',
    'La seguridad estadística requiere demanda histórica.',
  );
  assert(
    typeof p.supuestos === 'string' &&
      p.supuestos.trim().length >= 10 &&
      p.supuestos.length <= 500,
    'Describe los supuestos utilizados (10 a 500 caracteres).',
  );
  return p;
}
