import { money } from './domain.js';
// This acknowledges a cashier's manual check; it never represents bank verification.
export function qrSaleFingerprint(cart, products) {
  if (!cart.length) return '';
  const lines=cart.map(item=>{
    const product=products.find(p=>p.id===item.producto_id);
    if(!product || !Number.isInteger(item.cantidad) || item.cantidad<=0 || !Number.isFinite(product.precio_venta) || product.precio_venta<=0)return null;
    return [item.producto_id,item.cantidad,product.precio_venta];
  });
  if(lines.some(line=>line===null))return '';
  return JSON.stringify(lines.sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
}
export function canConfirmQrSale(cart, products, acknowledged) {
  const current=qrSaleFingerprint(cart,products);
  return !!current && current===acknowledged;
}
export function fixedQrPanel(total,verified,demo=false) {
  return `<section class="fixed-qr-panel" aria-label="Cobrar con QR fijo"><div class="fixed-qr-heading"><h3>Escanea para pagar</h3><span>Banco Ganadero</span></div><p class="fixed-qr-amount">Importe que debe ingresar el cliente<strong>${money(total)}</strong></p><div class="fixed-qr-image"><img src="src/assets/qr-ganadero.png" alt="QR de cobro proporcionado por Maycol, Banco Ganadero"><button type="button" class="secondary" data-action="enlarge-qr">Ampliar QR</button></div><p>Este QR es fijo. El cliente debe escribir el importe de esta venta en su aplicación bancaria.</p><p class="fixed-qr-manual">${demo?'La demostración muestra un QR bancario real. No necesitas pagar para probar la pantalla.':'Revisa en tu banca móvil que el dinero haya ingresado por el importe correcto. El sistema no consulta al banco.'}</p><label class="qr-manual-check"><input id="qr-manual-check" type="checkbox" ${verified?'checked':''}><span>${demo?'Simular verificación del ingreso (solo demostración)':'Verifiqué en mi banca móvil el ingreso de este importe.'}</span></label></section>`;
}
