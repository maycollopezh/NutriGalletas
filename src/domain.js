export const ROLES = { administrador: 'Administrador', cajero: 'Cajero', almacen: 'Encargado de almacén' };
export const PERMISSIONS = {
  administrador: ['dashboard', 'usuarios', 'categorias', 'productos', 'proveedores', 'compras', 'inventario', 'planificacion', 'ventas', 'gastos', 'asistente'],
  cajero: ['productos', 'ventas'],
  almacen: ['categorias', 'productos', 'proveedores', 'compras', 'inventario', 'planificacion'],
};
export const money = value => new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' }).format(Number(value || 0));
export const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const id = () => globalThis.crypto.randomUUID();
export function assert(condition, message) { if (!condition) throw new Error(message); }
export function availableStock(data, productId, day = today()) {
  return data.lotes_inventario.filter(l => l.producto_id === productId && l.fecha_vencimiento >= day).reduce((n, l) => n + l.cantidad_disponible, 0);
}
export function canAccess(user, page) { return !!user?.activo && (PERMISSIONS[user.rol] || []).includes(page); }
export function visibleSales(data, user) {
  assert(canAccess(user, 'ventas'), 'No tienes permiso para consultar ventas.');
  return data.ventas.filter(v => user.rol === 'administrador' || v.usuario_id === user.id);
}
export function registerSale(data, user, items, method, day = today(), payment = {}) {
  assert(['administrador', 'cajero'].includes(user?.rol) && user.activo, 'No tienes permiso para registrar ventas.');
  assert(['efectivo', 'qr', 'tarjeta'].includes(method), 'Método de pago inválido.');
  assert(items.length > 0, 'Agrega al menos un producto.');
  const quantities = new Map();
  for (const item of items) {
    assert(Number.isSafeInteger(item.cantidad) && item.cantidad > 0 && item.cantidad <= 100000, 'La cantidad debe ser un entero positivo.');
    quantities.set(item.producto_id, (quantities.get(item.producto_id) || 0) + item.cantidad);
  }
  // Validate the whole cart before mutating any stock.
  for (const [productId, quantity] of quantities) {
    const product = data.productos.find(p => p.id === productId && p.activo);
    assert(product, 'El producto no está disponible.');
    assert(availableStock(data, productId, day) >= quantity, `Stock insuficiente para ${product.nombre}.`);
  }
  const totalExpected=round([...quantities].reduce((n,[productId,quantity])=>n+quantity*data.productos.find(p=>p.id===productId).precio_venta,0));
  const received=method==='efectivo'?(payment.efectivo_recibido??totalExpected):null;
  if(method==='efectivo')assert(Number.isFinite(received)&&received>=totalExpected&&received<=999999&&Math.abs(round(received)-received)<1e-8,'El efectivo recibido no cubre el total o tiene más de dos decimales.');
  const customer=String(payment.correo_cliente||'').trim().toLowerCase();
  assert(!customer||(customer.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer)),'Correo del cliente inválido.');
  const sale = { id: id(), numero: Math.max(0, ...data.ventas.map(v => v.numero)) + 1, usuario_id: user.id, fecha: new Date().toISOString(), metodo_pago: method, efectivo_recibido: received, cambio: method==='efectivo'?round(received-totalExpected):null, correo_cliente:customer||null, total: 0, costo_total: 0 };
  for (const [productId, quantity] of quantities) {
    const product = data.productos.find(p => p.id === productId);
    let remaining = quantity;
    const lots = data.lotes_inventario.filter(l => l.producto_id === productId && l.cantidad_disponible > 0 && l.fecha_vencimiento >= day).sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento) || a.id.localeCompare(b.id));
    for (const lot of lots) {
      if (!remaining) break;
      const taken = Math.min(remaining, lot.cantidad_disponible);
      const detail = { id: id(), venta_id: sale.id, producto_id: productId, lote_id: lot.id, cantidad: taken, precio_unitario: product.precio_venta, costo_unitario: lot.costo_unitario };
      data.detalle_ventas.push(detail);
      data.movimientos_inventario.push({ id: id(), lote_id: lot.id, usuario_id: user.id, tipo: 'venta', cantidad: -taken, fecha: sale.fecha, referencia_id: sale.id });
      lot.cantidad_disponible -= taken;
      remaining -= taken;
      sale.total = round(sale.total + taken * product.precio_venta);
      sale.costo_total = round(sale.costo_total + taken * lot.costo_unitario);
    }
  }
  data.ventas.push(sale);
  return sale;
}
export function registerPurchase(data, user, input, day = today()) {
  assert(['administrador', 'almacen'].includes(user?.rol) && user.activo, 'No tienes permiso para recibir compras.');
  assert(data.proveedores.some(p => p.id === input.proveedor_id && p.activo), 'Selecciona un proveedor activo.');
  assert(data.productos.some(p => p.id === input.producto_id && p.activo), 'Selecciona un producto activo.');
  assert(Number.isSafeInteger(input.cantidad) && input.cantidad > 0 && input.cantidad <= 100000, 'Cantidad inválida.');
  assert(Number.isFinite(input.costo_unitario) && round(input.costo_unitario) > 0, 'El costo debe ser mayor que cero.');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(input.fecha_vencimiento) && !Number.isNaN(Date.parse(input.fecha_vencimiento)) && input.fecha_vencimiento >= day, 'El vencimiento debe ser una fecha vigente.');
  assert(input.codigo_lote?.trim().length > 0, 'Ingresa el código del lote.');
  assert(!data.lotes_inventario.some(l => l.producto_id === input.producto_id && l.codigo_lote === input.codigo_lote.trim()), 'Ese lote ya existe para el producto.');
  const purchase = { id: id(), proveedor_id: input.proveedor_id, usuario_id: user.id, fecha: new Date().toISOString(), total: round(input.cantidad * round(input.costo_unitario)), observacion: input.observacion || '' };
  const lot = { id: id(), compra_id: purchase.id, producto_id: input.producto_id, codigo_lote: input.codigo_lote.trim(), cantidad_inicial: input.cantidad, cantidad_disponible: input.cantidad, costo_unitario: round(input.costo_unitario), fecha_vencimiento: input.fecha_vencimiento };
  data.compras.push(purchase);
  data.lotes_inventario.push(lot);
  data.detalle_compras.push({ id: id(), compra_id: purchase.id, producto_id: input.producto_id, lote_id: lot.id, cantidad: input.cantidad, costo_unitario: lot.costo_unitario });
  data.movimientos_inventario.push({ id: id(), lote_id: lot.id, usuario_id: user.id, tipo: 'compra', cantidad: input.cantidad, fecha: purchase.fecha, referencia_id: purchase.id });
  return purchase;
}
export function financialSummary(data, from, to) {
  const localDate = stamp => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(stamp));
  const sales = data.ventas.filter(v => localDate(v.fecha) >= from && localDate(v.fecha) <= to);
  const expenses = data.gastos.filter(g => g.fecha >= from && g.fecha <= to);
  const revenue = round(sales.reduce((n, v) => n + v.total, 0));
  const cost = round(sales.reduce((n, v) => n + v.costo_total, 0));
  const expense = round(expenses.reduce((n, g) => n + g.monto, 0));
  return { revenue, cost, expense, gross: round(revenue - cost), net: round(revenue - cost - expense), count: sales.length };
}

// Registros internos de QA no forman parte del catálogo del negocio.
export const isBusinessProduct = product => !/^QA-\d+$/.test(product?.codigo || '');
