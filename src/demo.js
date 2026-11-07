import { id, today, registerSale, registerPurchase } from './domain.js';
const plusDays = n => { const d = new Date(today() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export function seedDemo() {
  const data = { perfiles_usuarios: [], categorias_productos: [], productos: [], proveedores: [], compras: [], detalle_compras: [], lotes_inventario: [], ventas: [], detalle_ventas: [], gastos: [], movimientos_inventario: [] };
  data.perfiles_usuarios = [
    { id: id(), nombre: 'Maycol López', email: 'admin@example.test', rol: 'administrador', activo: true },
    { id: id(), nombre: 'Jhissel Suárez', email: 'cajero@example.test', rol: 'cajero', activo: true },
    { id: id(), nombre: 'Isaura Fernández', email: 'almacen@example.test', rol: 'almacen', activo: true },
    { id: id(), nombre: 'Rebeca Yana', email: 'cajero2@example.test', rol: 'cajero', activo: true },
  ];
  data.categorias_productos = ['Integrales', 'Con semillas', 'Sin azúcar añadida'].map(nombre => ({ id: id(), nombre, descripcion: 'Galletas nutritivas en paquetes', activo: true }));
  data.proveedores = [
    { id: id(), nombre: 'Distribuidora Illimani (ficticia)', contacto: 'Ana Quispe', telefono: '70000001', direccion: 'Zona Villa Fátima, La Paz', activo: true },
    { id: id(), nombre: 'Sabores Andinos (ficticia)', contacto: 'Luis Mamani', telefono: '70000002', direccion: 'Zona Miraflores, La Paz', activo: true },
  ];
  const names = ['Avena y miel', 'Quinua y cacao', 'Chía y linaza', 'Coco integral', 'Amaranto y canela', 'Avena sin azúcar'];
  data.productos = names.map((nombre, i) => ({ id: id(), codigo: `GAL-${String(i + 1).padStart(3, '0')}`, nombre, categoria_id: data.categorias_productos[i % 3].id, presentacion: 'Paquete de 100 g', precio_venta: [6, 8, 7.5, 7, 8.5, 7][i], stock_minimo: 15, activo: true }));
  const admin = data.perfiles_usuarios[0];
  data.productos.forEach((p, i) => {
    const input = { producto_id: p.id, proveedor_id: data.proveedores[i % 2].id, cantidad: i === 0 ? 28 : 100, costo_unitario: [3.5, 4.8, 4.2, 4, 5, 4.1][i], codigo_lote: `LP-2026-${i + 1}A`, fecha_vencimiento: plusDays(i === 1 ? 10 : 60), observacion: 'Datos ficticios para evaluación académica' };
    const purchase = registerPurchase(data, admin, input); purchase.fecha = plusDays(-25) + 'T14:00:00-04:00';
    data.movimientos_inventario.filter(m => m.referencia_id === purchase.id).forEach(m => m.fecha = purchase.fecha);
  });
  for (let day = -20; day <= 0; day++) {
    const product = data.productos[(day + 20) % 5];
    const sale = registerSale(data, data.perfiles_usuarios[day % 2 === 0 ? 1 : 3], [{ producto_id: product.id, cantidad: 2 + ((day + 20) % 4) }], day % 2 ? 'qr' : 'efectivo');
    sale.fecha = plusDays(day) + 'T15:30:00-04:00';
    data.movimientos_inventario.filter(m => m.referencia_id === sale.id).forEach(m => m.fecha = sale.fecha);
  }
  // A past purchase was valid when received; its unsold lot has since expired.
  const oldPurchase = registerPurchase(data, admin, { producto_id: data.productos[5].id, proveedor_id: data.proveedores[1].id, cantidad: 8, costo_unitario: 4.1, codigo_lote: 'LP-VENCIDO-EJEMPLO', fecha_vencimiento: plusDays(-2), observacion: 'Lote recibido hace 45 días; ejemplo de vencimiento' }, plusDays(-45));
  oldPurchase.fecha = plusDays(-45) + 'T14:00:00-04:00';
  data.movimientos_inventario.filter(m => m.referencia_id === oldPurchase.id).forEach(m => m.fecha = oldPurchase.fecha);
  data.gastos = [
    { id: id(), usuario_id: admin.id, concepto: 'Transporte de mercadería', categoria: 'Transporte', monto: 25, fecha: plusDays(-2), observacion: 'Viaje dentro de La Paz' },
    { id: id(), usuario_id: admin.id, concepto: 'Bolsas para entrega en tienda', categoria: 'Materiales', monto: 12, fecha: today(), observacion: '' },
  ];
  return data;
}
