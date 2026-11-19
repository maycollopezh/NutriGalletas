import { withAutomaticMinimum } from '../investigacion-operativa/minimo-producto.js';
import { IMAGE_TABLES } from '../services/images.js';
import {
  validateInventoryParameters,
  inventoryDefaults,
} from '../investigacion-operativa/plan-inventario.js';
import { seedDemo } from './demo.js';
import {
  assert,
  canAccess,
  id,
  registerSale,
  registerPurchase,
} from '../domain/domain.js';
const key = 'nutrigalletas-demo-v1';
export class DemoStore {
  constructor() {
    try {
      this.data = JSON.parse(localStorage.getItem(key)) || seedDemo();
    } catch {
      this.data = seedDemo();
    }
    this.data.parametros_inventario ||= this.data.productos
      .filter((p) => /^GAL-00[1-6]$/.test(p.codigo))
      .map((p) => ({ ...inventoryDefaults(), producto_id: p.id }));
    if (!this.data.minimos_automaticos_v1) {
      this.data.parametros_inventario.forEach((p) => (p.demanda_fuente = 'historico'));
      this.data.minimos_automaticos_v1 = true;
    }
    this.user = null;
  }
  async load() {
    return withAutomaticMinimum(structuredClone(this.data));
  }
  async loginDemo(userId) {
    this.user = this.data.perfiles_usuarios.find((u) => u.id === userId && u.activo);
    assert(this.user, 'Usuario de demostración no disponible.');
    return this.user;
  }
  async logout() {
    this.user = null;
  }
  commit(data) {
    localStorage.setItem(key, JSON.stringify(data));
    this.data = data;
  }
  async save(table, values, existingId, imageChange) {
    const routes = {
      perfiles_usuarios: 'usuarios',
      categorias_productos: 'categorias',
      productos: 'productos',
      proveedores: 'proveedores',
    };
    assert(canAccess(this.user, routes[table]), 'No tienes permisos.');
    assert(this.user.rol !== 'cajero', 'El cajero solo puede consultar productos.');
    if (imageChange) {
      assert(IMAGE_TABLES.includes(table), 'Este registro no admite fotos.');
      values = { ...values, imagen_url: imageChange.remove ? null : imageChange.dataUrl };
    }
    const data = structuredClone(this.data);
    const record = { ...values, id: existingId || id() };
    if (table === 'productos') {
      // Ignorar cualquier mínimo manual recibido: se deriva al cargar el producto.
      delete record.stock_minimo;
      assert(
        record.codigo?.trim() && record.codigo.length <= 30 && record.nombre?.trim(),
        'Ingresa nombre y código (máximo 30 caracteres).',
      );
      assert(
        Number.isFinite(record.precio_venta) && record.precio_venta > 0,
        'Precio de venta inválido.',
      );
      assert(
        data.categorias_productos.some((c) => c.id === record.categoria_id),
        'Selecciona una categoría válida.',
      );
    }
    if (table === 'perfiles_usuarios') {
      assert(this.user.rol === 'administrador', 'Acceso restringido.');
      record.email = record.email.toLowerCase().trim();
      assert(
        ['administrador', 'cajero', 'almacen'].includes(record.rol) &&
          record.nombre?.trim(),
        'Perfil inválido.',
      );
      assert(
        !data[table].some(
          (r) =>
            r.id !== record.id && r.email.toLowerCase() === record.email.toLowerCase(),
        ),
        'Ese correo ya está registrado.',
      );
      assert(
        record.id !== this.user.id || (record.rol === 'administrador' && record.activo),
        'No puedes desactivar ni cambiar tu propio rol.',
      );
    }
    if (table === 'productos')
      assert(
        !data[table].some((r) => r.id !== record.id && r.codigo === record.codigo),
        'El código de producto ya existe.',
      );
    if (table === 'categorias_productos')
      assert(
        !data[table].some(
          (r) =>
            r.id !== record.id && r.nombre.toLowerCase() === record.nombre.toLowerCase(),
        ),
        'La categoría ya existe.',
      );
    const index = data[table].findIndex((r) => r.id === record.id);
    if (index < 0) data[table].push(record);
    else data[table][index] = { ...data[table][index], ...record };
    this.commit(data);
    return record;
  }
  async sale(items, method, payment = {}) {
    const data = structuredClone(this.data);
    const sale = registerSale(data, this.user, items, method, undefined, payment);
    this.commit(data);
    return sale;
  }
  async purchase(input) {
    const data = structuredClone(this.data);
    const purchase = registerPurchase(data, this.user, input);
    const param = data.parametros_inventario?.find(
      (p) => p.producto_id === input.producto_id,
    );
    if (param)
      param.unidades_en_camino = Math.max(0, param.unidades_en_camino - input.cantidad);
    this.commit(data);
    return purchase;
  }
  async savePlanning(productId, values) {
    assert(
      this.user?.activo && this.user.rol === 'administrador',
      'Solo el administrador modifica parámetros.',
    );
    assert(
      this.data.productos.some((p) => p.id === productId),
      'Producto no encontrado.',
    );
    validateInventoryParameters(values);
    const data = structuredClone(this.data),
      record = {
        ...values,
        producto_id: productId,
        actualizado_en: new Date().toISOString(),
      };
    const index = data.parametros_inventario.findIndex(
      (p) => p.producto_id === productId,
    );
    if (index < 0) data.parametros_inventario.push(record);
    else data.parametros_inventario[index] = record;
    this.commit(data);
    return record;
  }
  async sendReceipt() {
    throw new Error(
      'La demostración no envía correos. Usa el sistema conectado para enviar un recibo real.',
    );
  }
  async resetUser() {
    throw new Error(
      'La demostración no utiliza contraseñas ni envía correos. Esta función estará disponible al conectar Supabase.',
    );
  }
  resetDemo() {
    const data = seedDemo();
    data.parametros_inventario = data.productos.map((p) => ({
      ...inventoryDefaults(),
      producto_id: p.id,
    }));
    this.commit(data);
    this.user = null;
  }
}
