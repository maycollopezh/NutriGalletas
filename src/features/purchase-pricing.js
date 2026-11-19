import { money } from '../domain/domain.js';

export function purchasePricingFields() {
  return /* HTML */ `<fieldset class="field full purchase-pricing">
    <legend>Precio de venta y ganancia por paquete</legend>
    <p>Precio actual: <strong data-purchase-current>Selecciona un producto</strong></p>
    <label
      >Ganancia sugerida sobre el costo (%)
      <input
        name="porcentaje_ganancia"
        type="number"
        min="0"
        max="500"
        step="0.01"
        value="33"
      />
    </label>
    <p data-purchase-suggestion>Introduce el costo para calcular una sugerencia.</p>
    <label
      ><input name="actualizar_precio_venta" type="checkbox" checked /> Actualizar el
      precio de venta al guardar esta compra</label
    >
    <label
      >Nuevo precio de venta por paquete (Bs)
      <input name="nuevo_precio_venta" type="number" min="0.01" step="0.01" />
    </label>
    <button type="button" data-use-suggested-price>Usar precio sugerido</button>
    <p data-purchase-profit aria-live="polite"></p>
    <p class="field-hint">
      33% sobre un costo de Bs5 equivale a Bs6,65 de venta y Bs1,65 de ganancia bruta por
      paquete. No es un margen del 33% sobre la venta. El precio nuevo se aplica a ventas
      futuras del producto; los pedidos ya aprobados conservan su precio.
    </p>
  </fieldset>`;
}

export function syncPurchasePricing(form, data, changed = '') {
  const fields = form.elements;
  const product = data.productos.find((p) => p.id === fields.producto_id.value);
  if (changed === 'producto_id') {
    fields.porcentaje_ganancia.value = product?.porcentaje_ganancia_sugerido ?? 33;
    delete form.dataset.manualPrice;
    form.dataset.previousPrice = product?.precio_venta ?? '';
  }
  if (changed === 'nuevo_precio_venta') form.dataset.manualPrice = 'true';
  if (changed === 'porcentaje_ganancia' || changed === 'suggested')
    delete form.dataset.manualPrice;
  const cost = Number(fields.costo_unitario.value);
  const pct = Number(fields.porcentaje_ganancia.value);
  const valid =
    Number.isFinite(cost) && cost > 0 && Number.isFinite(pct) && pct >= 0 && pct <= 500;
  const suggested = valid
    ? Math.round((cost * (1 + pct / 100) + Number.EPSILON) * 100) / 100
    : null;
  form.querySelector('[data-purchase-current]').textContent = product
    ? money(product.precio_venta)
    : 'Selecciona un producto';
  form.querySelector('[data-purchase-suggestion]').textContent =
    suggested === null
      ? 'Introduce el costo para calcular una sugerencia.'
      : `Precio sugerido: ${money(suggested)} · ganancia bruta: ${money(suggested - cost)} por paquete.`;
  if (!form.dataset.manualPrice)
    fields.nuevo_precio_venta.value = suggested === null ? '' : suggested.toFixed(2);
  const update = fields.actualizar_precio_venta.checked;
  fields.nuevo_precio_venta.disabled = !update;
  fields.nuevo_precio_venta.required = update;
  const price = Number(update ? fields.nuevo_precio_venta.value : product?.precio_venta);
  form.querySelector('[data-purchase-profit]').textContent =
    valid && Number.isFinite(price) && price > 0
      ? (price <= cost ? '⚠ El precio elegido no deja ganancia sobre este lote. ' : '') +
        `Venta futura: ${money(price)} · ganancia bruta por paquete: ${money(price - cost)}.`
      : '';
}

export function purchasePricingPayload(form) {
  const update = form.elements.actualizar_precio_venta.checked;
  return {
    actualizar_precio_venta: update,
    nuevo_precio_venta: update ? Number(form.elements.nuevo_precio_venta.value) : null,
    porcentaje_ganancia: Number(form.elements.porcentaje_ganancia.value),
    precio_venta_anterior: update ? Number(form.dataset.previousPrice) : null,
  };
}
