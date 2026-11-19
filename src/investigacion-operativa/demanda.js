// Promedio diario y desviación muestral sobre días completos de Bolivia.
import { today } from '../domain/domain.js';

export function shiftInventoryDay(day, amount) {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
export function aggregateDailySales(data, day = today()) {
  const sales = new Map(
    data.ventas.map((v) => [
      v.id,
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/La_Paz',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(v.fecha)),
    ]),
  );
  const rows = new Map();
  const first = shiftInventoryDay(day, -365);
  for (const item of data.detalle_ventas) {
    const date = sales.get(item.venta_id);
    if (!date || date < first || date >= day) continue;
    const key = item.producto_id + ':' + date;
    const row = rows.get(key) || {
      producto_id: item.producto_id,
      fecha: date,
      cantidad: 0,
    };
    row.cantidad += Number(item.cantidad);
    rows.set(key, row);
  }
  return [...rows.values()];
}

/** d = suma de ventas / N; s = sqrt(sum((x-d)^2)/(N-1)). */
export function demandStatistics(rows, productId, days, day) {
  const dates = new Map(
    rows
      .filter((r) => r.producto_id === productId)
      .map((r) => [r.fecha, Number(r.cantidad)]),
  );
  const series = Array.from(
    { length: days },
    (_, i) => dates.get(shiftInventoryDay(day, -days + i)) || 0,
  );
  const units = series.reduce((a, b) => a + b, 0);
  const mean = units / series.length;
  const deviation = Math.sqrt(
    series.reduce((n, v) => n + (v - mean) ** 2, 0) / (series.length - 1),
  );
  return { series, units, mean, deviation };
}
