import {prepareImage,IMAGE_TABLES} from './images.js';
import { cashSettlement, saleLots, replenishment, validReceiptEmail } from './operations.js';
import { qrSaleFingerprint, canConfirmQrSale, fixedQrPanel } from './payments.js';
import { planningView, planningForm, planningRows } from './inventory-view.js';
import { productPhoto } from './visuals.js';
import { config } from './config.js';
import { DemoStore } from './store.js';
import { CloudStore } from './supabase.js';
import { ROLES, PERMISSIONS, money, today, availableStock, financialSummary, canAccess, visibleSales, isBusinessProduct } from './domain.js';

const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
let store, data, user, page = 'dashboard', search = '', cart = [], toastTimer;
let viewGeneration = 0;
let qrAcknowledged = '';
let cashReceived='', customerEmail='', checkoutRequest=null;
const receiptEmailStatus=new Map();
const imageChanges=new WeakMap();
let sideRecord = null, expandedSale = '';
let categoryFilter = '', inventoryFilter = 'all', saleOpen = false, saleMethod = 'efectivo', saleSearch = '';
let from = shiftDay(-6), to = today();
const titles = { planificacion:'Comprar a tiempo',dashboard:'Resumen del negocio',usuarios:'Equipo',categorias:'Categorías',productos:'Productos',proveedores:'Proveedores',compras:'Compras',inventario:'Inventario',ventas:'Ventas',gastos:'Gastos' };
const descriptions = { dashboard:'Así va tu tienda. Revisa lo vendido y lo que necesita atención.',usuarios:'El administrador crea las cuentas y asigna sus tareas.',categorias:'Agrupa las galletas para encontrarlas más rápido.',productos:'Guarda nombre, presentación y precio.',proveedores:'Encuentra sus datos cuando necesites reponer.',compras:'Una compra recibida suma productos al inventario.',inventario:'Lo que tienes y lo que necesita atención.',ventas:'Consulta lo vendido y abre sus comprobantes.',gastos:'Registra las salidas de dinero de tu negocio.' };
function shiftDay(n) { const d = new Date(today() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function formatDate(v) { return new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'medium' }).format(new Date(v.length === 10 ? v + 'T12:00:00Z' : v)); }
function localDay(v) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(v)); }
function name(table, recordId) { return data[table]?.find(r => r.id === recordId)?.nombre || '—'; }
function matches(...values) { return values.join(' ').toLowerCase().includes(search.toLowerCase()); }
function icon(type) {
  const paths = { flecha:'<path d="M5 12h14m-6-6 6 6-6 6"/>',mas:'<path d="M12 5v14M5 12h14"/>',check:'<path d="m5 12 4 4L19 6"/>',editar:'<path d="m15 4 5 5M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z"/>',eliminar:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',calendario:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18"/>',telefono:'<path d="m6 3 4 4-2 3a14 14 0 0 0 6 6l3-2 4 4-2 3C10 23 1 14 3 5Z"/>',ubicacion:'<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',efectivo:'<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9h.01M18 15h.01"/>',qr:'<path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h2v2h-2zM19 19h2v2h-2zM19 13h2v3M13 19v2h3"/>',  planificacion: '<path d="M3 17l5-5 4 3 8-10M14 5h6v6M3 21h18"/>', salir:'<path d="M9 4H4v16h5M14 8l4 4-4 4M8 12h10"/>', buscar:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>', dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>', usuarios: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>', productos: '<path d="m3 7 9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>', ventas: '<path d="M5 3h14v18l-3-2-4 2-4-2-3 2zM8 8h8M8 12h8M8 16h4"/>', compras: '<path d="M3 3h2l3 13h11l2-9H6M9 20h.01M18 20h.01"/>', gastos: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M14 14h5"/>', proveedores: '<path d="M3 7h12v12H3zM15 11h4l3 4v4h-7M6 19v2M18 19v2"/>', categorias: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>', inventario: '<path d="m3 8 9-5 9 5v13H3zM7 21V11h10v10M7 15h10M7 18h10"/>' };
  Object.assign(paths, {dashboard:'<path d="m3 10 9-7 9 7v11h-6v-8H9v8H3z"/>',ventas:'<path d="M3 21h18M5 21V12h3v9M11 21V7h3v14M17 21V3h3v18"/>',planificacion:paths.calendario,categorias:'<path d="M3 13V4h9l9 9-9 9z"/><circle cx="8" cy="8" r="1"/>',inventario:'<path d="m8 2 7 4-7 4-7-4zM1 6v8l7 4 7-4V6M8 10v8m9-9 6 4-7 4-7-4m7 4v6m7-10v7l-7 3-7-4"/>',gastos:'<ellipse cx="15" cy="5" rx="6" ry="3"/><path d="M9 5v5c0 4 12 4 12 0V5M21 10v5c0 3-6 4-9 2"/><ellipse cx="7" cy="14" rx="6" ry="3"/><path d="M1 14v5c0 4 12 4 12 0v-5"/>'});
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[type] || paths.dashboard}</svg>`;
}
const brand = () => `<div class="brand"><span class="brand-mark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9 4 4 0 0 0 4 4 4 4 0 0 0 5 5Z"/><circle cx="8" cy="9" r=".7"/><circle cx="7" cy="15" r=".7"/><circle cx="13" cy="16" r=".7"/></svg></span><span>NutriGalletas<small>GESTIÓN DE TU TIENDA</small></span></div>`;
function toast(message, error = false) { const el = document.querySelector('#toast'); el.textContent = message; el.className = error ? 'error' : ''; el.style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.style.display = 'none', 5500); }
function openModal(title, body) { document.querySelector('#modal-content').innerHTML = `<div class="dialog-head"><h2>${title}</h2><button data-action="close" aria-label="Cerrar">×</button></div>${body}`; modal.showModal(); }
function badge(text, kind = '') { return `<span class="badge ${kind}">${esc(text)}</span>`; }
function panelTable(headers, rows, empty = 'No hay registros para mostrar.') { return `<div class="panel table-wrap"><table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headers.length}" class="empty">${empty}</td></tr>`}</tbody></table></div><p class="table-count">${rows.length} registro${rows.length === 1 ? '' : 's'}</p>`; }
function editButton(table, recordId) { return `<button class="small" data-action="edit" data-table="${table}" data-id="${recordId}">Editar</button>`; }
function searchBar(placeholder = 'Buscar…') { return `<div class="filter-bar"><label class="search">Buscar<input id="search" type="search" placeholder="${placeholder}" value="${esc(search)}"></label></div>`; }
function dateFilters() { return `<div class="filter-bar"><label>Desde<input type="date" id="from" value="${from}" max="${to}"></label><label>Hasta<input type="date" id="to" value="${to}" min="${from}"></label><button class="small" data-action="today">Hoy</button><button class="small" data-action="week">Últimos 7 días</button></div>`; }
function pageHead(button = '') { return `<div class="page-head"><div><span class="section-kicker">${page === 'dashboard' ? 'EL PULSO DE TU TIENDA' : ['productos','categorias','proveedores','usuarios'].includes(page) ? 'ADMINISTRACIÓN' : 'OPERACIÓN DIARIA'}</span><h1>${({productos:'Tus galletas, bien organizadas',usuarios:'Cada persona, con su acceso',inventario:'Lo que tienes y lo que necesita atención',ventas:'Cada venta, en su lugar',compras:'Registra lo que llega a tu tienda',gastos:'Ten claros tus gastos',proveedores:'Quién abastece tu tienda',categorias:'Organiza tus variedades'})[page]||titles[page]}</h1><p class="subtitle">${descriptions[page] || 'Una vista clara de tus ventas, costos y existencias.'}</p></div>${button}</div>`; }
function loginView() {
  viewGeneration++; user=null; saleOpen=false; qrAcknowledged=''; cashReceived=''; customerEmail=''; checkoutRequest=null;
  app.innerHTML=`<div class="login cookie-login"><section class="login-scene">${brand()}<div class="login-message"><span class="eyebrow">HECHO PARA TU DÍA A DÍA</span><h1>Todo en orden.<br><span>Todo más simple.</span></h1><p>Ventas, productos y existencias.<br>Tu tienda, en un solo lugar.</p></div><img src="src/assets/login-cookies.png" alt="Galletas de avena sobre un plato de cerámica" class="login-photograph"><span class="login-scene-note">NutriGalletas · La Paz, Bolivia</span></section><section class="login-form"><div class="login-inner"><span class="login-mini-icon">${icon('inventario')}</span><h2>${config.mode==='demo'?'Explora tu tienda':'Entra a tu tienda'}</h2><p class="subtitle">${config.mode==='demo'?'Elige una cuenta para probar el sistema.':'Usa la cuenta que te asignó el administrador.'}</p>${config.mode==='demo'?`<div class="notice">Modo de demostración. Datos ficticios, sin acceso a Supabase.</div><div class="demo-roles">${store.data.perfiles_usuarios.filter(u=>u.activo).map(u=>`<button class="demo-role" data-action="demo-login" data-id="${u.id}"><span class="avatar">${esc(u.nombre.slice(0,2).toUpperCase())}</span><span><strong>${esc(u.nombre)}</strong><small>${ROLES[u.rol]}</small></span><span class="arrow">›</span></button>`).join('')}</div>`:`<form id="login-form" class="login-fields"><label class="field">Correo electrónico<input name="email" type="email" autocomplete="username" placeholder="tu@correo.com" required></label><label class="field">Contraseña<input name="password" type="password" autocomplete="current-password" placeholder="Tu contraseña" required minlength="12"></label><button class="primary wide">Iniciar sesión ${icon('flecha')}</button><p class="form-error" role="alert"></p></form><button class="text-button recover-link" data-action="recover">Recuperar acceso del administrador</button>`}<p class="login-help">${icon('info')} ¿Necesitas ayuda? Habla con el administrador.</p></div></section></div>`;
}
async function refresh() {
  const generation = viewGeneration, owner = store.user;
  if (!owner) return;
  let nextData;
  try { nextData = await store.load(); }
  catch (error) {
    if (generation !== viewGeneration || store.user?.id !== owner.id) return;
    throw error;
  }
  // A completed request from an old session must not redraw or report errors on the login screen.
  if (generation !== viewGeneration || store.user?.id !== owner.id) return;
  data = nextData; user = store.user;
  const profile = data.perfiles_usuarios.find(p => p.id === user.id);
  if (!profile || !profile.activo) { store.stopUpdates?.(); store.user = null; loginView(); throw new Error('Tu sesión no está autorizada. Inicia sesión nuevamente o consulta al administrador.'); }
  user = store.user = profile; render();
}
function planningNotice() {
  if (!canAccess(user, 'planificacion') || data.planificacion_pendiente) return '';
  const plans = planningRows(data).filter(r => r.plan.needsOrder);
  return `<div class="notice ${plans.length ? '' : 'green'}"><strong>${plans.length} productos en punto de pedido.</strong> Según demanda, entrega, reserva y paquetes en camino. <button class="text-button" data-page="planificacion">Ver planificación</button></div>`;
}
function render() {
  if (!canAccess(user, page)) page = PERMISSIONS[user.rol][0];
  const groups = [['TU NEGOCIO', ['dashboard', 'ventas', 'compras', 'inventario', 'planificacion', 'gastos']], ['ORGANIZACIÓN', ['productos', 'categorias', 'proveedores', 'usuarios']]];
  app.innerHTML = `<div class="shell" data-view="${page}"><button class="nav-veil" data-action="menu" aria-label="Cerrar menú"></button><aside class="sidebar">${brand()}<div class="workspace-label"><span class="workspace-dot"></span> MI TIENDA <span class="workspace-place">La Paz, BO</span></div><div class="sidebar-navigation">${groups.map(([label, pages]) => `<nav class="nav-group" aria-label="${label}"><p class="nav-label">${label}</p>${pages.filter(p => canAccess(user, p)).map(p => `<button class="nav-item ${page === p ? 'active' : ''}" data-page="${p}" ${page === p ? 'aria-current="page"' : ''}>${icon(p)}<span>${p === 'dashboard' ? 'Resumen' : titles[p]}</span>${page === p ? '<span class="nav-current-dot" aria-hidden="true"></span>' : ''}</button>`).join('')}</nav>`).join('')}</div><div class="sidebar-bottom"><div class="user"><span class="avatar">${esc(user.nombre.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join(''))}</span><div><strong>${esc(user.nombre)}</strong><small>${ROLES[user.rol]}</small></div></div><button class="logout-button" data-action="logout">${icon('salir')}<span>Cerrar sesión</span></button></div></aside><main class="main"><header class="topbar"><div class="topbar-context"><button class="mobile-menu small" data-action="menu" aria-label="Abrir menú" aria-expanded="false">☰</button><span class="mobile-brand">NutriGalletas</span><span class="topbar-icon">${icon(page)}</span><span class="breadcrumb">NutriGalletas <span> › </span><b>${titles[page]}</b></span></div><div class="top-actions"><span class="mode ${config.mode === 'demo' ? '' : 'cloud'}">${config.mode === 'demo' ? 'DEMOSTRACIÓN' : 'Mi tienda'}</span><span class="date">${icon('calendario')} ${formatDate(today())}</span><span class="top-profile">${icon('usuarios')} <strong>${esc(user.nombre.split(' ')[0])}</strong></span><button class="refresh-button" data-action="refresh" aria-label="Actualizar datos">↻</button></div></header><div class="content">${data.mejoras_pendientes?'<p class="notice">Hay una actualización de inventario y cobros pendiente de activar en la base de datos.</p>':''}${saleOpen && page === 'ventas' ? saleView() : composedView()}</div><footer class="app-footer"><span>NutriGalletas <span class="footer-star" aria-hidden="true">✳</span> Cada detalle cuenta.</span><span>Gestión de tu tienda</span></footer></main></div>`;
}
function salesTable(sales,actions=true) {
  return `<div class="table-wrap"><table><thead><tr><th>Comprobante</th><th>Fecha</th><th>Atendió</th><th>Pago</th><th>Total</th>${actions?'<th>Acción</th>':''}</tr></thead><tbody>${sales.map(v=>`<tr><td>${actions?`<button class="sale-expand" data-action="expand-sale" data-id="${v.id}" aria-label="Detalle del comprobante ${v.numero}" aria-expanded="${expandedSale===v.id}">${expandedSale===v.id?'⌄':'›'}</button>`:''}<strong>#${String(v.numero).padStart(4,'0')}</strong></td><td>${formatDate(v.fecha)}</td><td>${esc(name('perfiles_usuarios',v.usuario_id))}</td><td>${badge(v.metodo_pago==='qr'?'QR':v.metodo_pago[0].toUpperCase()+v.metodo_pago.slice(1),'neutral')}</td><td><strong>${money(v.total)}</strong></td>${actions?`<td><button class="small" data-action="receipt" data-id="${v.id}">Ver comprobante</button></td>`:''}</tr>${actions&&expandedSale===v.id?`<tr class="sale-expanded"><td colspan="6"><div><strong>Detalle de la venta</strong><span>${data.detalle_ventas.filter(d=>d.venta_id===v.id).map(d=>`${d.cantidad} paquetes de ${esc(name('productos',d.producto_id))} · lote ${esc(data.lotes_inventario.find(l=>l.id===d.lote_id)?.codigo_lote||'registrado')} × ${money(d.precio_unitario)}`).join('<br>')}</span><b>Total ${money(v.total)}</b></div></td></tr>`:''}`).join('')||`<tr><td colspan="${actions?6:5}" class="empty">No hay ventas en este período.</td></tr>`}</tbody></table></div>`;
}
function minimumInfo(product) {
 const p=replenishment(data,product);
 return `<div class="minimum-info"><span>Mínimo para reponer <strong>${p.minimum==null?'Sin estimación':p.minimum+' paquetes'}</strong></span><small>${p.daily==null?'El administrador debe configurar la planificación.':`Demanda diaria: ${new Intl.NumberFormat('es-BO',{maximumFractionDigits:2}).format(p.daily)} paquetes · ${p.source==='historico'?`promedio de ${p.days} días`:'estimación ingresada'}`}</small>${p.configured&&p.minimum==null?'<small>Faltan ventas recientes para calcular la reposición.</small>':''}</div>`;
}
function lotAllocationHtml(items) {
 try{return saleLots(data,items).map(l=>`<span class="sale-lot"><b>${esc(l.codigo_lote)}</b> · ${l.cantidad} paquetes · vence ${formatDate(l.fecha_vencimiento)}</span>`).join('');}catch(error){return `<span class="form-error">${esc(error.message)}</span>`;}
}
function updatePaymentControls() {
 const total=cart.reduce((n,i)=>n+data.productos.find(p=>p.id===i.producto_id).precio_venta*i.cantidad,0);
 const cash=cashSettlement(total,cashReceived),change=document.querySelector('#cash-change'),message=document.querySelector('#cash-message');
 if(change)change.textContent=cash.change==null?'—':money(cash.change);
 if(message)message.textContent=cashReceived?cash.message:'';
 const confirm=document.querySelector('[data-action="checkout"]');
 if(confirm)confirm.disabled=!cart.length||(saleMethod==='efectivo'&&!cash.valid)||(saleMethod==='qr'&&!canConfirmQrSale(cart,data.productos,qrAcknowledged));
}
function saleView() {
  const qrVerified=canConfirmQrSale(cart,data.productos,qrAcknowledged);
  const products=data.productos.filter(isBusinessProduct).filter(p=>p.activo&&(p.nombre+' '+p.codigo).toLowerCase().includes(saleSearch.toLowerCase()));
  const total=cart.reduce((n,i)=>n+data.productos.find(p=>p.id===i.producto_id).precio_venta*i.cantidad,0);
  return `<div class="page-head"><div><span class="section-kicker">NUEVA VENTA</span><h1>Registra una venta</h1><p class="subtitle">Elige las galletas, revisa las cantidades y confirma.</p></div><button class="text-button" data-action="cancel-sale">← Volver a ventas</button></div><ol class="sale-steps" aria-label="Cómo registrar una venta"><li class="current"><span>1</span> Elige productos</li><li class="${cart.length?'current':''}"><span>2</span> Revisa la venta</li><li><span>3</span> Confirma</li></ol><div class="sale-workbench"><section class="panel sale-catalog"><div class="panel-head"><div><h2>¿Qué vas a vender?</h2><p>Toca un producto para agregarlo.</p></div></div><label class="sale-search"><span class="sr-only">Buscar producto para la venta</span>${icon('buscar')}<input id="sale-search" type="search" value="${esc(saleSearch)}" placeholder="Buscar producto (ej. avena, quinua…)"></label><div class="sale-products">${products.map(p=>{const available=availableStock(data,p.id);return`<button class="sale-product" data-action="add-cart" data-id="${p.id}" ${available<1?'disabled':''}>${productPhoto(p,'sale-photo')}<span><strong>${esc(p.nombre)}</strong><small>${esc(p.presentacion)}</small><em>${available} paquetes disponibles</em></span><b>${money(p.precio_venta)}</b><span class="add-product-symbol" aria-hidden="true">+</span></button>`;}).join('')||'<p class="empty">No encontramos productos para mostrar.</p>'}</div></section><section class="panel sale-ticket"><div class="panel-head"><h2>Esta venta</h2><span class="badge neutral">${cart.reduce((n,i)=>n+i.cantidad,0)} paquetes</span></div><div class="sale-ticket-body">${cart.map(item=>{const p=data.productos.find(p=>p.id===item.producto_id);return`<div class="ticket-item"><div class="ticket-item-name"><strong>${esc(p.nombre)}</strong><small>${money(p.precio_venta)} por paquete</small><div class="sale-lot-list">${lotAllocationHtml([item])}</div></div><div class="quantity-control"><button data-action="cart-step" data-id="${p.id}" data-step="-1" aria-label="Quitar un paquete de ${esc(p.nombre)}">−</button><input aria-label="Cantidad de ${esc(p.nombre)}" data-cart-id="${p.id}" type="number" min="1" max="${availableStock(data,p.id)}" step="1" value="${item.cantidad}"><button data-action="cart-step" data-id="${p.id}" data-step="1" aria-label="Agregar un paquete de ${esc(p.nombre)}">+</button></div><strong>${money(p.precio_venta*item.cantidad)}</strong><button class="remove-item" data-action="remove-cart" data-id="${p.id}" aria-label="Quitar ${esc(p.nombre)} de la venta">${icon('eliminar')}</button></div>`;}).join('')||'<div class="ticket-empty">'+icon('compras')+'<strong>Tu venta empieza aquí</strong><p>Agrega las galletas desde el listado.</p></div>'}<div class="cart-total"><span>Total</span><strong>${money(total)}</strong></div><fieldset class="payment-options"><legend>¿Cómo se pagará?</legend>${[['efectivo','Efectivo','efectivo'],['qr','QR','qr'],['tarjeta','Tarjeta','gastos']].map(([v,l,ic])=>`<button type="button" data-action="payment" data-method="${v}" aria-pressed="${saleMethod===v}">${icon(ic)}<span>${l}</span></button>`).join('')}</fieldset><input id="payment" type="hidden" value="${saleMethod}">${saleMethod==='qr'?fixedQrPanel(total,qrVerified,config.mode==='demo'):''}${saleMethod==='efectivo'?`<section class="cash-payment"><label class="field">Efectivo recibido (Bs)<input id="cash-received" type="number" min="${total}" max="999999" step="0.01" inputmode="decimal" value="${esc(cashReceived)}" placeholder="Ej. 20,00"></label><div class="cash-change"><span>Cambio a entregar</span><strong id="cash-change">${cashSettlement(total,cashReceived).change==null?'—':money(cashSettlement(total,cashReceived).change)}</strong></div><p id="cash-message" class="form-error" role="status">${cashReceived?esc(cashSettlement(total,cashReceived).message):''}</p></section>`:''}<label class="field customer-email">Correo del cliente (opcional)<input id="customer-email" type="email" maxlength="254" value="${esc(customerEmail)}" autocomplete="email" placeholder="cliente@correo.com"><small class="field-hint">Si lo completas, se enviará el recibo al confirmar.</small></label><p class="form-error sale-error" role="alert"></p><button class="primary wide confirm-sale" data-action="checkout" ${cart.length&&(saleMethod!=='qr'||qrVerified)&&(saleMethod!=='efectivo'||cashSettlement(total,cashReceived).valid)?'':'disabled'}>Confirmar venta · ${money(total)}</button><p class="field-hint">Al confirmar se actualizarán las existencias y podrás abrir el comprobante.</p></div></section></div>`;
}

const views = {
  planificacion() { return planningView(data, user, search); },
  dashboard() {
    const m = financialSummary(data, from, to);
    const products = data.productos.filter(isBusinessProduct).filter(p => p.activo);
    const low = products.filter(p => replenishment(data,p).needsOrder);
    const soon = data.lotes_inventario.filter(l => l.cantidad_disponible > 0 && l.fecha_vencimiento >= today() && l.fecha_vencimiento <= shiftDay(15) && products.some(p=>p.id===l.producto_id));
    const totals = new Map();
    const sales=data.ventas.filter(v=>localDay(v.fecha)>=from&&localDay(v.fecha)<=to);
    const ids=new Set(sales.map(v=>v.id));
    for(const d of data.detalle_ventas.filter(d=>ids.has(d.venta_id)))totals.set(d.producto_id,(totals.get(d.producto_id)||0)+d.cantidad);
    const ranked=[...totals.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4);
    const days=Array.from({length:7},(_,i)=>{const d=new Date(to+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-6+i);const day=d.toISOString().slice(0,10);return{day,value:day<from?0:financialSummary(data,day,day).revenue};});
    const max=Math.max(1,...days.map(d=>d.value));
    const attention=low.slice(0,2).map(p=>`<button class="attention-item" data-page="inventario"><span class="attention-icon">${icon('productos')}</span><span><strong>${esc(p.nombre)}</strong><small>Quedan ${availableStock(data,p.id)} paquetes</small></span><span class="badge warn">Quedan pocos</span><span aria-hidden="true">›</span></button>`).concat(soon.slice(0,2).map(l=>`<button class="attention-item" data-page="inventario"><span class="attention-icon">${icon('calendario')}</span><span><strong>${esc(name('productos',l.producto_id))}</strong><small>Lote ${esc(l.codigo_lote)} · vence el ${formatDate(l.fecha_vencimiento)}</small></span><span class="badge warn">Por vencer</span><span aria-hidden="true">›</span></button>`));
    return `${pageHead('<button class="primary" data-action="sale">'+icon('mas')+' Nueva venta</button>')}${dateFilters()}<section class="financial-strip" aria-label="Resultados del período">${[['Ventas',m.revenue,`${m.count} ventas registradas`],['Costo vendido',m.cost,'Lo que costaron los productos vendidos'],['Gastos',m.expense,'Salidas de dinero del período'],['Resultado neto',m.net,'Ventas menos costos y gastos']].map(([l,v,h],i)=>`<article class="financial-value ${i===0?'featured':''}"><span>${l}</span><strong>${money(v)}</strong><small>${h}</small></article>`).join('')}</section><div class="dashboard-workbench"><section class="panel sales-panel"><div class="panel-head"><div><span class="eyebrow">CÓMO VA TU TIENDA</span><h2>Ventas de los últimos 7 días</h2></div><span class="badge neutral">Hasta ${formatDate(to)}</span></div><div class="panel-body"><div class="chart" role="img" aria-label="${esc(days.map(d=>`${d.day}: ${money(d.value)}`).join('; '))}">${days.map(d=>`<div class="chart-column"><b>${money(d.value)}</b><div class="bar" style="height:${Math.max(3,d.value/max*150)}px"></div><span>${d.day.slice(8)}/${d.day.slice(5,7)}</span></div>`).join('')}</div></div></section><section class="panel attention-panel"><div class="panel-head"><div><span class="eyebrow">PARA TENER EN CUENTA</span><h2>Requiere atención</h2></div><span class="attention-count">${low.length+soon.length}</span></div><div class="attention-list">${attention.length?attention.join(''):'<div class="calm-state">'+icon('check')+'<strong>Todo en orden</strong><p>No hay productos con pocas existencias ni lotes próximos a vencer.</p></div>'}</div><button class="panel-bottom-link" data-page="inventario">Revisar inventario <span>↗</span></button></section></div><div class="dashboard-bottom"><section class="panel"><div class="panel-head"><h2>Ventas recientes</h2><button class="text-button" data-page="ventas">Ver todas ›</button></div>${salesTable(sales.slice().sort((a,b)=>b.fecha.localeCompare(a.fecha)).slice(0,5),false)}</section><section class="panel"><div class="panel-head"><h2>Las favoritas</h2><span class="badge neutral">Por paquetes</span></div><div class="favorites">${ranked.length?ranked.map(([id,q],i)=>{const p=data.productos.find(p=>p.id===id);return`<div class="favorite"><span class="rank-no">${i+1}</span>${productPhoto(p,'favorite-photo')}<strong>${esc(p?.nombre||'Producto')}</strong><span>${q}<small>paquetes</small></span></div>`;}).join(''):'<p class="empty">Todavía no hay ventas en este período.</p>'}</div></section></div>`;
  },
  productos() {
    const write=user.rol!=='cajero';
    const products=data.productos.filter(isBusinessProduct).filter(p=>matches(p.nombre,p.codigo,p.presentacion)&&(!categoryFilter||p.categoria_id===categoryFilter));
    return `${pageHead(write?'<button class="primary" data-action="new" data-table="productos">'+icon('mas')+' Agregar producto</button>':'')}
      <div class="catalog-toolbar">${searchBar('Busca por nombre o código')}<div class="category-filters" aria-label="Filtrar por categoría"><button data-action="filter-category" data-id="" aria-pressed="${!categoryFilter}">Todos</button>${data.categorias_productos.filter(c=>c.activo).map(c=>`<button data-action="filter-category" data-id="${c.id}" aria-pressed="${categoryFilter===c.id}">${esc(c.nombre)}</button>`).join('')}</div></div>
      <div class="catalog-grid">${products.map(p=>{const stock=availableStock(data,p.id);return`<article class="cookie-card ${!p.activo?'inactive-product':''}">${productPhoto(p,'catalog-photo')}<div class="cookie-card-body"><div class="product-topline"><span class="product-category">${esc(name('categorias_productos',p.categoria_id))}</span>${!p.activo?badge('Inactivo','neutral'):''}</div><h2>${esc(p.nombre)}</h2><p class="product-presentation">${esc(p.presentacion)}</p><span class="price-label">Precio de venta</span><strong class="product-price">${money(p.precio_venta)}</strong><div class="product-stock"><span>${stock} <small>paquetes disponibles</small></span>${p.activo&&replenishment(data,p).needsOrder?badge(stock===0?'Agotado':'Quedan pocos','warn'):''}</div>${minimumInfo(p)}<button class="text-button product-lots-link" data-action="product-lots" data-id="${p.id}">Ver cantidades por lote</button><div class="product-card-bottom"><span>${esc(p.codigo)}</span>${write?`<button class="text-button" data-action="edit" data-table="productos" data-id="${p.id}">${icon('editar')} Editar</button>`:''}</div></div></article>`;}).join('')||'<div class="empty panel">No encontramos productos con esa búsqueda.</div>'}</div><p class="table-count">${products.length} productos</p>`;
  },
  categorias() {
    const categories=data.categorias_productos.filter(c=>matches(c.nombre,c.descripcion));
    return `${pageHead('<button class="primary" data-action="new" data-table="categorias_productos">'+icon('mas')+' Agregar categoría</button>')}${searchBar('Busca una categoría')}<div class="category-layout"><div class="category-list">${categories.map(c=>{const ps=data.productos.filter(isBusinessProduct).filter(p=>p.categoria_id===c.id);return`<article class="category-row">${productPhoto({...ps[0],nombre:c.nombre,imagen_url:c.imagen_url},'category-photo')}<div><span class="product-category">${ps.length} productos</span><h2>${esc(c.nombre)}</h2><p>${esc(c.descripcion)}</p><div class="product-tags">${ps.map(p=>`<span>${esc(p.nombre)}</span>`).join('')}</div></div><div class="category-actions">${badge(c.activo?'Activa':'Inactiva',c.activo?'':'neutral')}${editButton('categorias_productos',c.id)}</div></article>`;}).join('')||'<p class="empty panel">No encontramos categorías.</p>'}</div><aside class="explanation-panel">${icon('categorias')}<h2>Encuentra todo más rápido</h2><p>Las categorías agrupan tus galletas por variedad. Cada producto pertenece a una categoría.</p><span class="help-note">Puedes cambiar la categoría al editar un producto.</span></aside></div>`;
  },
  proveedores() {
    return `${pageHead('<button class="primary" data-action="new" data-table="proveedores">'+icon('mas')+' Agregar proveedor</button>')}${searchBar('Buscar proveedor o contacto')}<div class="supplier-grid">${data.proveedores.filter(p=>matches(p.nombre,p.contacto,p.direccion)).map(p=>`<article class="supplier-card"><div class="supplier-header"><span class="large-icon">${icon('proveedores')}</span>${badge(p.activo?'Activo':'Inactivo',p.activo?'':'neutral')}</div><h2>${esc(p.nombre)}</h2><dl><div><dt>${icon('usuarios')} Contacto</dt><dd>${esc(p.contacto)||'Sin contacto'}</dd></div><div><dt>${icon('telefono')} Teléfono</dt><dd>${esc(p.telefono)||'Sin teléfono'}</dd></div><div><dt>${icon('ubicacion')} Dirección</dt><dd>${esc(p.direccion)||'Sin dirección'}</dd></div></dl><button class="secondary" data-action="edit" data-table="proveedores" data-id="${p.id}">${icon('editar')} Editar proveedor</button></article>`).join('')||'<p class="empty panel">No encontramos proveedores.</p>'}</div><p class="inline-help">${icon('info')} Estos datos se usan al recibir una compra.</p>`;
  },
  compras() {
    const rows=data.compras.filter(c=>matches(name('proveedores',c.proveedor_id),c.observacion)).sort((a,b)=>b.fecha.localeCompare(a.fecha));
    return `${pageHead('<button class="primary" data-action="purchase">'+icon('mas')+' Recibir productos</button>')}<p class="inline-help">${icon('info')} Al guardar una compra recibida, los paquetes se suman al inventario.</p>${searchBar('Buscar proveedor o nota')}<section class="panel"><div class="panel-head"><h2>Compras recibidas</h2><span class="badge neutral">${rows.length} registros</span></div><div class="purchase-list">${rows.map(c=>`<article class="purchase-row"><span class="large-icon">${icon('compras')}</span><div class="purchase-supplier"><h3>${esc(name('proveedores',c.proveedor_id))}</h3><span>${formatDate(c.fecha)}</span>${c.observacion?`<small>${esc(c.observacion)}</small>`:''}</div><div class="purchase-quantity"><strong>${data.detalle_compras.filter(d=>d.compra_id===c.id).reduce((n,d)=>n+d.cantidad,0)}</strong><small>paquetes recibidos</small></div><strong class="purchase-total">${money(c.total)}</strong><button class="text-button" data-action="purchase-detail" data-id="${c.id}">Ver detalle ›</button></article>`).join('')||'<p class="empty">Todavía no hay compras para mostrar.</p>'}</div></section>`;
  },
  inventario() {
    const products=data.productos.filter(isBusinessProduct).filter(p=>p.activo);
    const lots=data.lotes_inventario.filter(l=>isBusinessProduct(data.productos.find(p=>p.id===l.producto_id)));
    const soon=lots.filter(l=>l.cantidad_disponible>0&&l.fecha_vencimiento>=today()&&l.fecha_vencimiento<=shiftDay(15));
    const expired=lots.filter(l=>l.cantidad_disponible>0&&l.fecha_vencimiento<today());
    const low=products.filter(p=>replenishment(data,p).needsOrder);
    const filtered=lots.filter(l=>matches(name('productos',l.producto_id),l.codigo_lote)&&(inventoryFilter==='all'||inventoryFilter==='low'&&low.some(p=>p.id===l.producto_id)||inventoryFilter==='soon'&&soon.includes(l)||inventoryFilter==='expired'&&expired.includes(l))).sort((a,b)=>a.fecha_vencimiento.localeCompare(b.fecha_vencimiento));
    return `${pageHead('<button class="primary" data-action="purchase">'+icon('mas')+' Recibir productos</button>')}<div class="inventory-filters" aria-label="Filtrar inventario">${[['all','Todos los lotes',lots.length],['low','Quedan pocos',low.length],['soon','Por vencer',soon.length],['expired','Vencidos',expired.length]].map(([v,l,n])=>`<button data-action="filter-inventory" data-id="${v}" aria-pressed="${inventoryFilter===v}"><span>${l}</span><strong>${n}</strong></button>`).join('')}</div><div class="inventory-attention">${low.slice(0,1).map(p=>`<button data-action="filter-inventory" data-id="low">${icon('inventario')}<strong>${esc(p.nombre)}</strong><span>${availableStock(data,p.id)} paquetes</span><b>Quedan pocos</b><span>Ver detalle ›</span></button>`).join('')}${soon.slice(0,1).map(l=>`<button data-action="filter-inventory" data-id="soon">${icon('calendario')}<strong>${esc(name('productos',l.producto_id))}</strong><span>Vence el ${formatDate(l.fecha_vencimiento)}</span><b>Por vencer</b><span>Ver detalle ›</span></button>`).join('')}</div>${searchBar('Buscar producto o código de lote')}${panelTable(['Producto / lote','Disponibles / recibidos','Costo por paquete','Vence el','Estado'],filtered.map(l=>{const p=data.productos.find(p=>p.id===l.producto_id);return`<tr><td><div class="product-identity">${productPhoto(p,'table-photo')}<div><strong>${esc(p?.nombre)}</strong><small>Lote ${esc(l.codigo_lote)}</small>${minimumInfo(p)}</div></div></td><td><strong>${l.cantidad_disponible}</strong><small>de ${l.cantidad_inicial} recibidos · ${l.cantidad_inicial-l.cantidad_disponible} salieron</small></td><td>${money(l.costo_unitario)}</td><td>${formatDate(l.fecha_vencimiento)}</td><td>${badge(l.cantidad_disponible===0?'Agotado':l.fecha_vencimiento<today()?'Vencido':l.fecha_vencimiento<=shiftDay(15)?'Por vencer':'Disponible',l.cantidad_disponible===0?'neutral':l.fecha_vencimiento<today()?'bad':l.fecha_vencimiento<=shiftDay(15)?'warn':'')}</td></tr>`;}))}<p class="inline-help">${icon('info')} Se venden primero los paquetes que vencen antes. Los vencidos no se incluyen en lo disponible para vender.</p>`;
  },
  ventas() {
    const sales=visibleSales(data,user).filter(v=>localDay(v.fecha)>=from&&localDay(v.fecha)<=to).sort((a,b)=>b.fecha.localeCompare(a.fecha));
    return `${pageHead('<button class="primary" data-action="sale">'+icon('mas')+' Nueva venta</button>')}<div class="sales-overview"><div>${icon('ventas')}<span>Total vendido<strong>${money(sales.reduce((s,v)=>s+v.total,0))}</strong></span></div><div>${icon('compras')}<span>Ventas registradas<strong>${sales.length}</strong></span></div></div>${dateFilters()}${user.rol==='cajero'?'<p class="inline-help">'+icon('info')+' Aquí aparecen únicamente las ventas realizadas con tu cuenta.</p>':''}<section class="panel"><div class="panel-head"><div><h2>Ventas registradas</h2><p>Los comprobantes son de uso interno.</p></div></div>${salesTable(sales,true)}</section>`;
  },
  gastos() {
    const rows=data.gastos.filter(g=>g.fecha>=from&&g.fecha<=to).sort((a,b)=>b.fecha.localeCompare(a.fecha));
    return `${pageHead('<button class="primary" data-action="new" data-table="gastos">'+icon('mas')+' Agregar gasto</button>')}<div class="expense-overview"><span class="large-icon">${icon('gastos')}</span><div><span>Gastos del período</span><strong>${money(rows.reduce((n,g)=>n+g.monto,0))}</strong></div>${dateFilters()}</div>${panelTable(['Fecha','¿En qué se gastó?','Categoría','Monto','Acción'],rows.map(g=>`<tr><td>${formatDate(g.fecha)}</td><td><strong>${esc(g.concepto)}</strong><small>${esc(g.observacion)}</small></td><td>${badge(g.categoria,'neutral')}</td><td><strong>${money(g.monto)}</strong></td><td>${editButton('gastos',g.id)}</td></tr>`))}<p class="inline-help">${icon('info')} Las compras de productos se registran en Compras.</p>`;
  },
  usuarios() {
    return `${pageHead('<div class="toolbar"><button data-action="permissions">Ver permisos</button><button class="primary" data-action="new" data-table="perfiles_usuarios">'+icon('mas')+' Crear cuenta</button></div>')}<div class="team-layout"><section class="panel">${panelTable(['Persona','Tarea','Estado','Acciones'],data.perfiles_usuarios.map(u=>`<tr><td><div class="product-identity"><span class="avatar">${esc(u.nombre.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join(''))}</span><div><strong>${esc(u.nombre)}</strong><small>${esc(u.email)}</small></div></div></td><td>${badge(ROLES[u.rol],'neutral')}</td><td>${badge(u.activo?'Activo':'Inactivo',u.activo?'':'neutral')}</td><td><div class="toolbar">${editButton('perfiles_usuarios',u.id)}${u.id!==user.id?`<button class="small" data-action="reset-user" data-id="${u.id}">Restablecer acceso</button>`:''}</div></td></tr>`))}</section><aside class="role-guide"><h2>¿Qué puede hacer cada persona?</h2>${[['dashboard','Administrador','Organiza y revisa todo.'],['ventas','Cajero','Registra ventas y consulta las suyas.'],['inventario','Almacén','Recibe productos y controla existencias.']].map(([ic,l,h])=>`<div><span class="large-icon">${icon(ic)}</span><p><strong>${l}</strong><span>${h}</span></p></div>`).join('')}</aside></div><p class="inline-help">${icon('info')} Si alguien olvida su contraseña, el administrador inicia el restablecimiento.${config.mode==='demo'?' La demostración no envía correos.':''}</p>`;
  },
};

const schemas = {
  categorias_productos: { title: 'categoría', fields: [['nombre', 'Nombre'], ['descripcion', 'Descripción', 'textarea'], ['activo', 'Estado', 'status']] },
  productos: { title: 'producto', fields: [['codigo', 'Código del producto'], ['nombre', 'Nombre'], ['categoria_id', 'Categoría', 'categorias_productos'], ['presentacion', 'Presentación'], ['precio_venta', 'Precio de venta (Bs)', 'money'], ['activo', 'Estado', 'status']] },
  proveedores: { title: 'proveedor', fields: [['nombre', 'Nombre'], ['contacto', 'Persona de contacto'], ['telefono', 'Teléfono'], ['direccion', 'Dirección'], ['activo', 'Estado', 'status']] },
  gastos: { title: 'gasto', fields: [['concepto', '¿En qué se gastó?'], ['categoria', 'Categoría'], ['monto', 'Monto (Bs)', 'money'], ['fecha', 'Fecha', 'date'], ['observacion', 'Observación', 'textarea']] },
  perfiles_usuarios: { title: 'usuario', fields: [['nombre', 'Nombre completo'], ['email', 'Correo electrónico', 'email'], ['rol', 'Tarea de la persona', 'role'], ['activo', 'Estado', 'status']] },
};
function fieldHtml(key, label, type = 'text', value = '', optional = false) {
  const attrs = `name="${key}" ${optional ? '' : 'required'}`;
  let input;
  if (type === 'status') input = `<select ${attrs}><option value="true" ${value !== false ? 'selected' : ''}>Activo</option><option value="false" ${value === false ? 'selected' : ''}>Inactivo</option></select>`;
  else if (type === 'role') input = `<select ${attrs}>${Object.entries(ROLES).map(([v, l]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  else if (['productos', 'proveedores', 'categorias_productos'].includes(type)) input = `<select ${attrs}><option value="">Seleccionar…</option>${data[type].filter(r => (type !== 'productos' || isBusinessProduct(r)) && (r.activo || r.id === value)).map(r => `<option value="${r.id}" ${r.id === value ? 'selected' : ''}>${esc(r.nombre)}</option>`).join('')}</select>`;
  else if (type === 'textarea') input = `<textarea ${attrs} maxlength="500">${esc(value)}</textarea>`;
  else input = `<input ${attrs} type="${type === 'money' || type === 'integer' ? 'number' : type}" value="${esc(value)}" ${type === 'money' ? 'min="0.01" max="999999" step="0.01"' : type === 'integer' ? 'min="0" max="100000" step="1"' : type === 'text' ? 'maxlength="160"' : ''}>`;
  return `<label class="field ${type === 'textarea' ? 'full' : ''}">${label}${input}</label>`;
}
function editForm(table, existingId) {
  const schema = schemas[table]; if (!schema) return '';
  const record = data[table].find(r => r.id === existingId) || { activo: true, fecha: today(), precio_venta: '', stock_minimo: 15, presentacion: 'Paquete de 100 g', rol: 'cajero' };
  const password = table === 'perfiles_usuarios' && !existingId && config.mode !== 'demo' ? '<label class="field full">Contraseña inicial<input type="password" name="password" required minlength="12" autocomplete="new-password"><span class="field-hint">Mínimo 12 caracteres. No se guarda en las tablas de la aplicación.</span></label>' : '';
  return `<form id="edit-form" data-table="${table}" data-id="${existingId || ''}"><div class="form-grid">${schema.fields.map(([k, l, t]) => fieldHtml(k, l, t, record[k], ['descripcion', 'observacion'].includes(k))).join('')}${password}${IMAGE_TABLES.includes(table)?imageField(record):''}</div><p class="form-error" role="alert"></p><div class="form-actions"><button type="button" data-action="close">Cancelar</button><button class="primary">${table==='gastos'?'Guardar gasto':'Guardar cambios'}</button></div></form>`;
}
function imageField(record) {
 return `<section class="image-field full"><span class="image-field-title">Foto (opcional)</span><div class="image-upload-preview">${productPhoto(record,'form-photo')}<div><label class="image-upload-button">Cargar imagen<input type="file" name="imagen_archivo" accept="image/jpeg,image/png,image/webp" aria-label="Cargar imagen"></label><button type="button" class="text-button" data-action="remove-image">Usar imagen predeterminada</button><small>JPG, PNG o WebP · hasta 5 MB. La foto conserva sus proporciones.</small></div></div><p class="image-upload-status" role="status"></p></section>`;
}
document.addEventListener('change',async event=>{
 if(event.target.name!=='imagen_archivo')return;
 const input=event.target,form=input.form,file=input.files[0];if(!file)return;
 const previous=imageChanges.get(form);const version={loading:true};imageChanges.set(form,version);const status=form.querySelector('.image-upload-status');status.textContent='Preparando foto…';
 try{const prepared=await prepareImage(file);if(imageChanges.get(form)!==version)return;imageChanges.set(form,prepared);form.querySelector('.image-upload-preview>.product-photo').outerHTML=productPhoto({nombre:'Vista previa',imagen_url:prepared.dataUrl},'form-photo');status.textContent='Foto lista. Pulsa Guardar cambios para conservarla.';}
 catch(error){if(imageChanges.get(form)!==version)return;if(previous&&!previous.loading)imageChanges.set(form,previous);else imageChanges.delete(form);input.value='';status.textContent=error.message;}
});
function openEdit(table, existingId) {
 if(['proveedores','categorias_productos','gastos'].includes(table)) {sideRecord=existingId||'';render();document.querySelector('.side-editor input')?.focus();return;}
 openModal(`${existingId?'Editar':'Crear'} ${schemas[table].title}`,editForm(table,existingId));
}
function sideEditor(title,body) {return `<aside class="side-editor panel"><h2>${title}</h2>${body}</aside>`;}
function composedView() {
 let body=views[page]();
 if(page==='planificacion'&&user.rol==='administrador'&&!data.planificacion_pendiente){
   const rows=planningRows(data);const selected=rows.find(r=>r.product.id===sideRecord)||rows.find(r=>r.plan.needsOrder)||rows[0];
   if(selected)body=`<div class="reference-columns planning-columns"><div>${body}</div>${sideEditor('Ajustar recomendación',planningForm(data,selected.product.id))}</div>`;
 }
 if(['proveedores','categorias','gastos'].includes(page)){
  const table={proveedores:'proveedores',categorias:'categorias_productos',gastos:'gastos'}[page];
  const recordId=sideRecord===null?(page==='gastos'?undefined:data[table][0]?.id):sideRecord||undefined;
  body=`<div class="reference-columns"><div class="reference-list">${body}</div>${sideEditor(page==='gastos'?(recordId?'Editar gasto':'Nuevo gasto'):page==='categorias'?'Editar categoría':'Datos del proveedor',editForm(table,recordId))}</div>`;
 }
 if(page==='compras')body=`<div class="reference-columns"><div>${body}</div>${sideEditor('Recibir productos',purchaseForm())}</div>`;
 return body;
}

function purchaseForm() {
 return `<form id="purchase-form"><div class="purchase-stages"><b>1</b> Proveedor y producto <span>·</span> <b>2</b> Cantidad y vencimiento</div><div class="form-grid">${fieldHtml('proveedor_id','¿Quién te entrega?','proveedores').replace('class="field ','class="field full ').replace('class="field"','class="field full"')}${fieldHtml('producto_id','Producto','productos').replace('class="field ','class="field full ').replace('class="field"','class="field full"')}${fieldHtml('cantidad','Cantidad de paquetes','integer',1).replace('min="0"','min="1"')}${fieldHtml('costo_unitario','Costo por paquete (Bs)','money')}${fieldHtml('codigo_lote','Código de lote','text')}${fieldHtml('fecha_vencimiento','Vence el','date').replace('type="date"',`type="date" min="${today()}"`)}${fieldHtml('observacion','Nota (opcional)','textarea','',true)}</div><p class="field-hint">El lote y el vencimiento están impresos en el empaque.</p><div class="purchase-sum"><span>Total de la compra</span><strong id="purchase-total">Bs 0,00</strong></div><p class="form-error" role="alert"></p><div class="form-actions"><button type="button" data-action="close">Cancelar</button><button class="primary">Guardar recepción</button></div></form>`;
}
function openPurchase() {page='compras';saleOpen=false;render();const form=document.querySelector('#purchase-form');form.querySelector('[name="cantidad"]').min='1';form.querySelector('[name="fecha_vencimiento"]').min=today();form.querySelector('select')?.focus();}

function openSale() {
  saleOpen = true; page = 'ventas'; render();
}
function receipt(saleId) {
 const sale=visibleSales(data,user).find(v=>v.id===saleId);if(!sale)throw new Error('No tienes acceso a este comprobante.');
 const details=data.detalle_ventas.filter(d=>d.venta_id===sale.id);
 openModal('Comprobante interno',`<div class="receipt">${brand()}<p>La Paz, Bolivia<br><strong>COMPROBANTE INTERNO #${String(sale.numero).padStart(4,'0')}</strong></p><p>${formatDate(sale.fecha)} · ${esc(sale.metodo_pago.toUpperCase())}<br>Atendido por: ${esc(name('perfiles_usuarios',sale.usuario_id))}</p><div class="table-wrap"><table><thead><tr><th>Producto / lote</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead><tbody>${details.map(d=>{const lot=data.lotes_inventario.find(l=>l.id===d.lote_id);return `<tr><td>${esc(name('productos',d.producto_id))}<small>Lote ${esc(lot?.codigo_lote||'registrado')}${lot?.fecha_vencimiento?' · vence '+formatDate(lot.fecha_vencimiento):''}</small></td><td>${d.cantidad}</td><td>${money(d.precio_unitario)}</td><td>${money(d.precio_unitario*d.cantidad)}</td></tr>`;}).join('')}</tbody></table></div><div class="cart-total"><span>Total</span><strong>${money(sale.total)}</strong></div>${sale.metodo_pago==='efectivo'?`<p class="receipt-cash">Efectivo recibido: <b>${sale.efectivo_recibido==null?'No registrado':money(sale.efectivo_recibido)}</b><br>Cambio entregado: <b>${sale.cambio==null?'No registrado':money(sale.cambio)}</b></p>`:''}<p class="receipt-note">Documento de control interno, sin validez fiscal.<br>${config.mode==='demo'?'Datos ficticios para demostración académica.':'Gracias por tu compra.'}</p></div><form id="receipt-email-form" class="receipt-email-form" data-id="${sale.id}"><label class="field">Enviar recibo por correo<input name="email" type="email" maxlength="254" required value="${esc(sale.correo_cliente||'')}" placeholder="cliente@correo.com"></label><p class="form-error" role="alert"></p><p class="receipt-email-status" role="status">${esc(receiptEmailStatus.get(sale.id)||'')}</p><button class="secondary" ${config.mode==='demo'?'disabled':''}>Enviar recibo</button>${config.mode==='demo'?'<small class="field-hint">La demostración no envía correos.</small>':''}</form><div class="form-actions"><button data-action="close">Cerrar</button><button class="primary" data-action="print">Imprimir / guardar PDF</button></div>`);
}
async function deliverReceipt(saleId,email) {
 try{await store.sendReceipt(saleId,email);receiptEmailStatus.set(saleId,'Recibo aceptado por el servidor de correo. Revisa también spam.');}
 catch(error){receiptEmailStatus.set(saleId,'La venta está guardada. No se pudo enviar el recibo: '+error.message);throw error;}
 finally{const status=modal.querySelector('.receipt-email-status');if(status)status.textContent=receiptEmailStatus.get(saleId)||'';}
}
document.addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button) return;
  try {
    if (button.dataset.page) { saleOpen = false; sideRecord=null; expandedSale=''; page = button.dataset.page; search = ''; categoryFilter = ''; inventoryFilter = 'all'; render(); window.scrollTo({ top: 0, behavior: 'instant' }); return; }
    const action = button.dataset.action;
    if(action==='permissions'){openModal('Permisos por tarea',panelTable(['Sección','Administrador','Cajero','Almacén'],Object.keys(titles).map(p=>`<tr><td>${titles[p]}</td>${['administrador','cajero','almacen'].map(rol=>`<td>${PERMISSIONS[rol].includes(p)?(p==='productos'&&rol==='cajero'?'Solo consulta':p==='ventas'&&rol==='cajero'?'Registra y ve las suyas':p==='planificacion'&&rol==='almacen'?'Solo consulta':'Sí'):'Sin acceso'}</td>`).join('')}</tr>`))+'<p class="inline-help">Solo el administrador crea, activa y asigna tareas a las cuentas. Los permisos también se verifican en la base de datos.</p>');return;}
    if(action==='product-lots'){const p=data.productos.find(p=>p.id===button.dataset.id);if(!p)throw new Error('Producto no encontrado.');const lots=data.lotes_inventario.filter(l=>l.producto_id===p.id).sort((a,b)=>a.fecha_vencimiento.localeCompare(b.fecha_vencimiento)||a.id.localeCompare(b.id));openModal('Cantidades por lote · '+esc(p.nombre),minimumInfo(p)+panelTable(['Lote','Recibidos','Disponibles','Vence el','Estado'],lots.map(l=>`<tr><td>${esc(l.codigo_lote||'Lote registrado')}</td><td>${l.cantidad_inicial??'—'}</td><td>${l.cantidad_disponible}</td><td>${formatDate(l.fecha_vencimiento)}</td><td>${l.fecha_vencimiento<today()?'Vencido':l.cantidad_disponible?'Disponible':'Agotado'}</td></tr>`))+'<p class="inline-help">Para vender se usa primero el lote que vence antes. Los vencidos se excluyen.</p>');return;}
    if(action==='remove-image'){const form=button.closest('form');imageChanges.set(form,{remove:true});form.elements.imagen_archivo.value='';form.querySelector('.image-upload-preview>.product-photo').outerHTML=productPhoto(null,'form-photo');form.querySelector('.image-upload-status').textContent='Se usará la imagen predeterminada al guardar.';return;}
    if (action === 'filter-category') { categoryFilter=button.dataset.id; render(); return; }
    if (action === 'filter-inventory') { inventoryFilter=button.dataset.id; render(); return; }
    if (action === 'cancel-sale') { qrAcknowledged=''; saleOpen=false; cart=[]; render(); return; }
    if (action === 'enlarge-qr') {openModal('QR de cobro · Banco Ganadero',`<p class="qr-modal-total">El cliente debe ingresar <strong>${money(cart.reduce((n,i)=>n+data.productos.find(p=>p.id===i.producto_id).precio_venta*i.cantidad,0))}</strong> en su aplicación bancaria.</p><img class="qr-full-image" src="src/assets/qr-ganadero.png" alt="QR bancario de cobro de Maycol"><p class="field-hint">QR fijo. La confirmación del ingreso se realiza manualmente en la banca móvil.</p>`);return;}
    if (action === 'payment') { if(saleMethod!==button.dataset.method)qrAcknowledged=''; saleMethod=button.dataset.method; openSale(); return; }
    if (action === 'cart-step') {
      qrAcknowledged='';
      const item=cart.find(i=>i.producto_id===button.dataset.id); if(!item)return;
      const next=item.cantidad+Number(button.dataset.step);
      if(next>availableStock(data,item.producto_id))throw new Error('No hay más paquetes disponibles.');
      if(next<=0)cart=cart.filter(i=>i!==item); else item.cantidad=next;
      openSale(); return;
    }
    if (action === 'plan-edit' && page==='planificacion') { if(user.rol!=='administrador')throw new Error('Solo el administrador modifica parámetros.');sideRecord=button.dataset.id;render();return; }
    if (action === 'expand-sale') {expandedSale=expandedSale===button.dataset.id?'':button.dataset.id;render();return;}
    if (action === 'plan-edit' || action === 'plan-example') { if (user.rol !== 'administrador') throw new Error('Solo el administrador modifica parámetros.'); openModal('Ajustar recomendación', planningForm(data, button.dataset.id, action === 'plan-example')); modal.style.width = 'min(850px, calc(100vw - 30px))'; }
    if (action === 'close') { if(modal.open)modal.close(); else {sideRecord='';render();} return; }
    if (action === 'menu') { const shell=document.querySelector('.shell'); shell.classList.toggle('menu-open'); shell.querySelector('[data-action="menu"]:not(.nav-veil)')?.setAttribute('aria-expanded',String(shell.classList.contains('menu-open'))); return; }
    if (action === 'demo-login') { user = await store.loginDemo(button.dataset.id); page = PERMISSIONS[user.rol][0]; await refresh(); }
    if (action === 'logout') { viewGeneration++; store.stopUpdates?.(); try { await store.logout(); } finally { store.stopUpdates?.(); cart = []; loginView(); } }
    if (action === 'refresh') { await refresh(); toast('Datos actualizados.'); }
    if (action === 'new') openEdit(button.dataset.table);
    if (action === 'edit') openEdit(button.dataset.table, button.dataset.id);
    if (action === 'purchase') openPurchase();
    if (action === 'purchase-detail') {
      const c = data.compras.find(c => c.id === button.dataset.id);
      openModal('Detalle de compra recibida', `<p>${esc(name('proveedores', c.proveedor_id))} · ${formatDate(c.fecha)}</p>${panelTable(['Producto', 'Cantidad', 'Costo unitario'], data.detalle_compras.filter(d => d.compra_id === c.id).map(d => `<tr><td>${esc(name('productos', d.producto_id))}</td><td>${d.cantidad}</td><td>${money(d.costo_unitario)}</td></tr>`))}<div class="cart-total"><span>Total</span><strong>${money(c.total)}</strong></div>`);
    }
    if (action === 'sale') { cashReceived='';customerEmail='';checkoutRequest=null;qrAcknowledged=''; cart = []; saleSearch=''; saleMethod='efectivo'; openSale(); window.scrollTo({top:0,behavior:'instant'}); }
    if (action === 'add-cart') { qrAcknowledged=''; const productId = button.dataset.id; const item = cart.find(i => i.producto_id === productId); if ((item?.cantidad || 0) >= availableStock(data, productId)) throw new Error('No hay más unidades disponibles.'); if (item) item.cantidad++; else cart.push({ producto_id: productId, cantidad: 1 }); openSale(); }
    if (action === 'remove-cart') { qrAcknowledged=''; cart = cart.filter(i => i.producto_id !== button.dataset.id); openSale(); }
    if (action === 'checkout') {
      const total=cart.reduce((n,i)=>n+data.productos.find(p=>p.id===i.producto_id).precio_venta*i.cantidad,0);
      const settlement=cashSettlement(total,cashReceived);
      if(saleMethod==='efectivo'&&!settlement.valid)throw new Error(settlement.message||'Ingresa el efectivo recibido.');
      if(saleMethod==='qr'&&!canConfirmQrSale(cart,data.productos,qrAcknowledged))throw new Error('Verifica el ingreso en tu banca móvil antes de confirmar esta venta.');
      saleLots(data,cart);
      const email=customerEmail.trim()?validReceiptEmail(customerEmail):null;
      const signature=JSON.stringify([cart,saleMethod,settlement.received,email]);
      if(checkoutRequest?.signature!==signature)checkoutRequest={signature,id:crypto.randomUUID()};
      button.disabled=true;
      try{const sale=await store.sale(cart,saleMethod,{efectivo_recibido:settlement.received,correo_cliente:email,solicitud_id:checkoutRequest.id});cart=[];qrAcknowledged='';checkoutRequest=null;saleOpen=false;modal.close();await refresh();receipt(sale.id);toast('Venta registrada. Inventario actualizado.');if(email&&config.mode!=='demo'){try{await deliverReceipt(sale.id,email);}catch{}}}
      catch(error){button.disabled=false;throw error;}
    }
    if (action === 'receipt') receipt(button.dataset.id);
    if (action === 'print') window.print();
    if (action === 'today') { from = to = today(); render(); }
    if (action === 'week') { from = shiftDay(-6); to = today(); render(); }
    if (action === 'reset-user') { await store.resetUser(button.dataset.id); toast('Se envió el enlace de restablecimiento al empleado.'); }
    if (action === 'recover') openModal('Recuperar acceso del administrador', '<form id="recover-form"><label class="field">Correo del administrador<input name="email" type="email" required autocomplete="email"></label><p class="field-hint" style="margin-top:10px">Los empleados deben solicitar ayuda al administrador.</p><p class="form-error" role="alert"></p><div class="form-actions"><button type="button" data-action="close">Cancelar</button><button class="primary">Solicitar enlace</button></div></form>');
  } catch (error) { toast(error.message, true); }
});
document.addEventListener('change', event => {
  const el = event.target;
  if(el.id==='qr-manual-check'){qrAcknowledged=el.checked?qrSaleFingerprint(cart,data.productos):'';const confirm=document.querySelector('[data-action="checkout"]');if(confirm)confirm.disabled=!canConfirmQrSale(cart,data.productos,qrAcknowledged);return;}
  if (el.id === 'from' || el.id === 'to') { if (el.id === 'from') from = el.value || today(); else to = el.value || today(); if (from > to) { toast('El inicio debe ser anterior al final.', true); from = to; } render(); }
  if (el.dataset.cartId) { qrAcknowledged=''; const item = cart.find(i => i.producto_id === el.dataset.cartId); const value = Number(el.value); if (!Number.isInteger(value) || value < 1 || value > availableStock(data, item.producto_id)) { toast('Cantidad fuera del stock disponible.', true); } else item.cantidad = value; openSale(); }
});
document.addEventListener('input', event => {
  if(event.target.id==='cash-received'){cashReceived=event.target.value;updatePaymentControls();return;}
  if(event.target.id==='customer-email'){customerEmail=event.target.value;return;}
  if(event.target.id==='daily-demand'){const annual=event.target.form.elements.demanda_anual;annual.value=String(Math.round(Number(event.target.value)*365*100)/100);}
  if(event.target.closest('#purchase-form')){const form=event.target.closest('form');const total=Number(form.elements.cantidad.value)*Number(form.elements.costo_unitario.value);form.querySelector('#purchase-total').textContent=money(Number.isFinite(total)?total:0);}
  if (event.target.id === 'sale-search') { const field=event.target; const position=field.selectionStart; saleSearch=field.value; openSale(); const next=document.querySelector('#sale-search'); next.focus(); if(position!==null)next.setSelectionRange(position,position); return; }
  if (event.target.id !== 'search') return;
  const input = event.target; const position = input.selectionStart; search = input.value; render(); const next = document.querySelector('#search'); next.focus(); if (position !== null) next.setSelectionRange(position, position);
});
document.addEventListener('submit', async event => {
  event.preventDefault(); const form = event.target; const submit = form.querySelector('button:not([type="button"])');
  const values = Object.fromEntries(new FormData(form)); const errorEl = form.querySelector('.form-error'); if (errorEl) errorEl.textContent = '';
  if (submit) submit.disabled = true;
  try {
    if(form.id==='receipt-email-form'){await deliverReceipt(form.dataset.id,validReceiptEmail(values.email));}
    if (form.id === 'login-form') { if (submit) submit.textContent = 'Iniciando sesión…'; user = await store.login(values.email.trim(), values.password); if (submit) submit.textContent = 'Cargando datos…'; page = PERMISSIONS[user.rol][0]; await refresh(); await store.startUpdates?.(() => { if (!modal.open && !saleOpen && !document.activeElement?.closest('.side-editor') && document.visibilityState === 'visible') refresh().catch(e => toast(e.message, true)); }); }
    if (form.id === 'recover-form') { await store.recover(values.email.trim()); modal.close(); toast('Si el correo corresponde al administrador, recibirá un enlace de recuperación.'); }
    if (form.id === 'password-form') { await store.finishRecovery(values.password); modal.close(); loginView(); toast('Contraseña actualizada. Inicia sesión nuevamente.'); }
    if (form.id === 'edit-form') {
      for (const [key, , type] of schemas[form.dataset.table].fields) {
        if (type === 'money' || type === 'integer') values[key] = Number(values[key]);
        if (type === 'status') values[key] = values[key] === 'true';
        if (typeof values[key] === 'string') values[key] = values[key].trim();
      }
      const imageChange=imageChanges.get(form);if(imageChange?.loading)throw new Error('Espera a que termine de prepararse la foto.');delete values.imagen_archivo;
      await store.save(form.dataset.table, values, form.dataset.id || undefined,imageChange); sideRecord=null; modal.close(); await refresh(); toast('Registro guardado correctamente.');
    }
    if (form.id === 'planning-form') {
      for (const key of ['demanda_anual','periodo_dias','costo_pedido','costo_mantenimiento_anual','plazo_entrega_dias','stock_seguridad','nivel_servicio','vida_util_dias','capacidad_maxima','unidades_en_camino']) values[key] = Number(values[key]);
      values.supuestos = values.supuestos.trim();
      await store.savePlanning(form.dataset.id, values); modal.close(); await refresh(); toast('Parámetros guardados. Cálculos actualizados.');
    }
    if (form.id === 'purchase-form') { values.cantidad = Number(values.cantidad); values.costo_unitario = Number(values.costo_unitario); await store.purchase(values); modal.close(); await refresh(); toast('Compra recibida. Lote e inventario actualizados.'); }
  } catch (error) { if (errorEl) errorEl.textContent = error.message; else toast(error.message, true); }
  finally { if (submit) { submit.disabled = false; if (form.id === 'login-form') submit.textContent = 'Iniciar sesión'; } }
});
modal.addEventListener('close', () => modal.style.width = '');
try {
  store = config.mode === 'demo' ? new DemoStore() : await CloudStore.create();
  if (config.mode !== 'demo') store.client.auth.onAuthStateChange(event => {
    if (event === 'PASSWORD_RECOVERY') { loginView(); openModal('Establecer nueva contraseña', '<form id="password-form"><label class="field">Nueva contraseña<input name="password" type="password" required minlength="12" autocomplete="new-password"></label><p class="form-error" role="alert"></p><div class="form-actions"><button class="primary">Actualizar contraseña</button></div></form>'); }
  });
  loginView();
} catch (error) { app.innerHTML = `<div class="connection-error">${brand()}<h1 style="margin-top:35px">Conexión pendiente</h1><p>${esc(error.message)}</p><p class="muted">Revisa la guía de configuración del proyecto. No se sustituirán los datos de Supabase por datos de demostración.</p></div>`; }
