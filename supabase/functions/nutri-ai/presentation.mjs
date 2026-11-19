import { day, money } from './core.mjs';
export const isInternalText = (text) =>
  /(?:^|\n)\s*(?:saludo breve[.!]?|el usuario (?:pregunta|quiere|solicita|pide)|se (?:requiere|debe) (?:una respuesta|responder)|(?:intent|accion|razonamiento|an[aá]lisis interno)\s*:)/i.test(
    String(text || ''),
  );
export function customerText(
  text,
  fallback = '¿Qué necesitas saber sobre NutriGalletas?',
) {
  const value = String(text || '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return !value || isInternalText(value) ? fallback : value;
}
export function briefFinance(r) {
  return `Resumen del ${day(new Date(r.desde))} al ${day(new Date(r.hasta))}\n\n• Ingresos: ${money(r.ingreso)}\n• Costo de lo vendido: ${money(r.costo_historico)}\n• Ganancia bruta: ${money(r.ganancia_bruta)}\n\n${r.ventas} ventas. Ganancia bruta; no utilidad neta. Cifras internas según lo registrado.`;
}
export function inventoryAlert(r, today = day()) {
  const names = new Map((r.rendimiento || []).map((p) => [p.id, p.nombre]));
  const low = (r.inventario || []).filter((p) => p.reponer);
  const expired = (r.lotes || []).filter((l) => l.vence < today);
  const soon = (r.lotes || []).filter(
    (l) => l.vence >= today && new Date(l.vence) - new Date(today) <= 15 * 86400000,
  );
  const sections = ['Aviso de inventario'];
  const list = (title, rows, render) => {
    if (!rows.length) return;
    sections.push(
      title +
        '\n' +
        rows.slice(0, 5).map(render).join('\n') +
        (rows.length > 5
          ? `\nY ${rows.length - 5} más; revisa Inventario en la web.`
          : ''),
    );
  };
  list('Necesitan reposición', low, (p) => {
    const stock = (r.lotes || [])
      .filter((l) => l.producto === names.get(p.producto_id) && l.vence >= today)
      .reduce((sum, l) => sum + Number(l.cantidad), 0);
    return `• ${names.get(p.producto_id) || 'Producto'}: ${stock} paquetes disponibles; mínimo ${p.minimo_reposicion ?? 'sin estimación'}.`;
  });
  list(
    'Vencidos — no vender',
    expired,
    (l) =>
      `• ${l.producto}: ${l.cantidad} paquetes · lote ${l.lote} · venció ${l.vence}.`,
  );
  list(
    'Vencen en los próximos 15 días',
    soon,
    (l) => `• ${l.producto}: ${l.cantidad} paquetes · lote ${l.lote} · vence ${l.vence}.`,
  );
  if (sections.length === 1) return '';
  sections.push(
    'Revisa los lotes en Inventario. Para ver cálculos y recomendaciones, pregunta «¿qué conviene reponer y por qué?»',
  );
  return sections.join('\n\n');
}

export function reportForChat(r, topic, today = day()) {
  if (topic === 'finanzas') return briefFinance(r);
  if (topic === 'vencimientos')
    return (
      inventoryAlert({ ...r, inventario: [] }, today) ||
      'No hay lotes vencidos ni por vencer en los próximos 15 días.'
    );
  const names = new Map((r.rendimiento || []).map((p) => [p.id, p.nombre]));
  const rows =
    topic === 'inventario'
      ? (r.inventario || []).filter((p) => names.has(p.producto_id))
      : (r.rendimiento || []).filter(
          (p) =>
            topic !== 'estancados' ||
            !p.ultima_venta ||
            new Date(today) - new Date(p.ultima_venta) > 30 * 86400000,
        );
  const lines = rows.slice(0, 5).map((p) => {
    if (topic === 'inventario') {
      const available = (r.lotes || [])
        .filter((l) => l.producto === names.get(p.producto_id) && l.vence >= today)
        .reduce((sum, l) => sum + Number(l.cantidad), 0);
      return `• ${names.get(p.producto_id)}: ${available} paquetes disponibles.\n  Mínimo: ${p.minimo_reposicion ?? 'sin estimación'} · demanda: ${Number(p.demanda_diaria).toFixed(2)}/día${p.reponer ? ' · Reponer' : ''}.`;
    }
    if (topic === 'estancados')
      return `• ${p.nombre}: ${p.ultima_venta ? 'última venta ' + day(new Date(p.ultima_venta)) : 'sin ventas registradas'}.`;
    if (topic === 'margenes')
      return `• ${p.nombre}: ${Number(p.ingreso) > 0 ? (((Number(p.ingreso) - Number(p.costo_historico)) / Number(p.ingreso)) * 100).toFixed(1) + '%' : 'sin ventas'}.`;
    return `• ${p.nombre}: ${p.unidades} paquetes · ${money(p.ingreso)}.`;
  });
  return (
    (topic === 'inventario'
      ? 'Inventario y reposición'
      : topic === 'margenes'
        ? 'Margen bruto sobre ventas'
        : topic === 'estancados'
          ? 'Sin venta reciente (más de 30 días)'
          : 'Productos vendidos') +
    '\n\n' +
    (lines.join('\n\n') || 'No hay datos para este período.') +
    (rows.length > 5 ? '\n\nHay más productos. Indica cuál quieres revisar.' : '') +
    '\n\nPuedes pedirme el detalle de un producto.'
  );
}
