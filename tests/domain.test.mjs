import test from 'node:test';
import assert from 'node:assert/strict';
import { registerSale, registerPurchase, visibleSales, availableStock, financialSummary } from '../src/domain.js';
const admin = { id: 'a', rol: 'administrador', activo: true };
const cashier = { id: 'c', rol: 'cajero', activo: true };
function fixture() { return { productos: [{ id: 'p', nombre: 'Avena', activo: true, precio_venta: 5 }], proveedores: [{ id: 's', activo: true }], ventas: [], detalle_ventas: [], compras: [], detalle_compras: [], movimientos_inventario: [], gastos: [], lotes_inventario: [
  { id: 'new', producto_id: 'p', fecha_vencimiento: '2099-03-01', cantidad_disponible: 10, costo_unitario: 3 },
  { id: 'old', producto_id: 'p', fecha_vencimiento: '2099-02-01', cantidad_disponible: 2, costo_unitario: 2 },
  { id: 'expired', producto_id: 'p', fecha_vencimiento: '2000-01-01', cantidad_disponible: 50, costo_unitario: 1 }
] }; }
test('Sale consumes earliest expiry first and preserves historic costs', () => {
  const d = fixture(); const sale = registerSale(d, cashier, [{ producto_id: 'p', cantidad: 3 }], 'qr');
  assert.equal(sale.total, 15); assert.equal(sale.costo_total, 7);
  assert.equal(d.lotes_inventario[1].cantidad_disponible, 0); assert.equal(d.lotes_inventario[0].cantidad_disponible, 9);
  assert.equal(d.lotes_inventario[2].cantidad_disponible, 50);
  d.productos[0].precio_venta = 8;
  assert.equal(sale.total, 15); assert.equal(d.detalle_ventas[0].precio_unitario, 5);
});
test('Duplicate product lines cannot oversell and invalid cart leaves no changes', () => {
  const d = fixture(); const before = structuredClone(d);
  assert.throws(() => registerSale(d, cashier, [{ producto_id: 'p', cantidad: 7 }, { producto_id: 'p', cantidad: 6 }], 'efectivo'), /Stock insuficiente/);
  assert.deepEqual(d, before);
});
test('Expired lots excluded; zero and fractional quantities rejected', () => {
  const d = fixture(); assert.equal(availableStock(d, 'p'), 12);
  for (const cantidad of [0, -1, 1.2]) assert.throws(() => registerSale(d, cashier, [{ producto_id: 'p', cantidad }], 'qr'));
});
test('Cashier sees own sales; warehouse cannot register or inspect sales', () => {
  const d = fixture(); registerSale(d, admin, [{ producto_id: 'p', cantidad: 1 }], 'qr'); registerSale(d, cashier, [{ producto_id: 'p', cantidad: 1 }], 'qr');
  assert.equal(visibleSales(d, cashier).length, 1); assert.equal(visibleSales(d, admin).length, 2);
  const warehouse = { id: 'w', rol: 'almacen', activo: true };
  assert.throws(() => visibleSales(d, warehouse)); assert.throws(() => registerSale(d, warehouse, [{ producto_id: 'p', cantidad: 1 }], 'qr'));
});
test('Purchases create lot and movement; duplicate lots rejected', () => {
  const d = fixture(); const input = { proveedor_id: 's', producto_id: 'p', cantidad: 5, costo_unitario: 2.5, fecha_vencimiento: '2099-01-01', codigo_lote: 'LP-001' };
  registerPurchase(d, admin, input); assert.equal(availableStock(d, 'p'), 17); assert.equal(d.compras[0].total, 12.5);
  assert.throws(() => registerPurchase(d, admin, input), /ya existe/);
  assert.throws(() => registerPurchase(d, cashier, { ...input, codigo_lote: 'otro' }), /permiso/);
});
test('Net result deducts cost of sold units, not all inventory purchases', () => {
  const d = fixture(); d.ventas = [{ fecha: '2026-10-11T03:30:00Z', total: 100, costo_total: 60 }];
  d.gastos = [{ fecha: '2026-10-10', monto: 10 }]; d.compras = [{ total: 2000 }];
  assert.deepEqual(financialSummary(d, '2026-10-10', '2026-10-10'), { revenue: 100, cost: 60, expense: 10, gross: 40, net: 30, count: 1 });
});
