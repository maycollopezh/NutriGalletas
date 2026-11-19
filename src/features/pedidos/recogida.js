import { money } from '../../domain/domain.js';
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const time = (v) =>
  new Date(v).toLocaleString('es-BO', {
    timeZone: 'America/La_Paz',
    dateStyle: 'short',
    timeStyle: 'short',
  });
let connection,
  userId,
  role,
  busy = false,
  loaded = false,
  notice = '',
  orders = [],
  settings = null,
  timer = null;
const labels = {
  pendiente_aprobacion: 'Solicitud pendiente de aprobación',
  esperando_comprobante: 'Esperando comprobante · reserva 10 min',
  leyendo_comprobante: 'Leyendo comprobante',
  pago_por_verificar: 'Comprobantes recibidos · revisar importe',
  pagado: 'Pagado · por preparar',
  listo: 'Preparado para recoger',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
  expirado: 'Reserva vencida',
};
export function ordersView(store, user) {
  if (!['administrador', 'cajero'].includes(user?.rol)) return '';
  if (userId !== user.id) {
    userId = user.id;
    orders = [];
    loaded = false;
    notice = '';
    settings = null;
  }
  connection = store;
  role = user.rol;
  if (!loaded && store.client) {
    loaded = true;
    queueMicrotask(() => request({ action: 'lista' }));
  }
  if (!timer)
    timer = setInterval(() => {
      if (
        document.querySelector('#pickup-orders') &&
        !busy &&
        !document.activeElement?.closest('#pickup-config-form,.pickup-payment-check')
      )
        request({ action: 'lista' }, true);
    }, 30000);
  return /* HTML */ `<section id="pickup-orders">
    <div class="page-head">
      <div>
        <h1>Pedidos para recoger</h1>
        <p>Solo recogida en tienda. Revisa la hora, prepara y registra la entrega.</p>
      </div>
      <button data-order="lista" ${busy ? 'disabled' : ''}>Actualizar</button>
    </div>
    ${!store.client
      ? '<p class="panel">Necesitas iniciar sesión en el sistema conectado.</p>'
      : ''}${notice
      ? /* HTML */ `<p class="form-error" role="status">${esc(notice)}</p>`
      : ''}${busy ? '<p role="status">Actualizando…</p>' : ''}
    <div class="pickup-grid">
      ${orders.length
        ? orders.map(card).join('')
        : '<section class="panel"><p>No hay pedidos para mostrar.</p></section>'}
    </div>
    ${role === 'administrador' && settings ? configForm() : ''}
  </section>`;
}
function card(o) {
  const active = [
    'pendiente_aprobacion',
    'esperando_comprobante',
    'leyendo_comprobante',
    'pago_por_verificar',
  ].includes(o.estado);
  return /* HTML */ `<article class="panel pickup-card">
    <span class="badge">${esc(labels[o.estado] || o.estado)}</span>
    <h2>${esc(o.nombre)}</h2>
    <p>
      <strong>Recoger: ${time(o.fecha_recogida)}</strong><br />WhatsApp:
      +${esc(o.telefono)}
    </p>
    <ul>
      ${(o.items || [])
        .map((i) => /* HTML */ `<li>${esc(i.cantidad)} paquetes de ${esc(i.nombre)}</li>`)
        .join('')}
    </ul>
    <p class="pickup-total">Total: ${money(o.total)}</p>
    ${o.pago_revision && o.pago_revision !== 'sin_comprobante'
      ? /* HTML */ `<div class="pickup-proof">
          <h3>
            ${esc(
              {
                parcial: 'Pago incompleto',
                exacto: 'Importe completo leído',
                excedente: 'Posible excedente · atención humana',
                revision: 'Lectura dudosa · atención humana',
              }[o.pago_revision] || 'Revisión de pago',
            )}
          </h3>
          <p>
            Importe leído acumulado: ${money(o.total_comprobantes || 0)}.
            ${o.pago_revision === 'parcial'
              ? 'Falta completar ' +
                money(Math.max(0, Number(o.total) - Number(o.total_comprobantes))) +
                '. La IA solicita únicamente esa diferencia con el QR.'
              : ''}
            ${o.pago_revision === 'excedente'
              ? 'Posible cambio: ' +
                money(Number(o.total_comprobantes) - Number(o.total)) +
                '. Revisar los abonos y coordinar con el cliente en Atención de WhatsApp.'
              : ''}
          </p>
          <small
            >La lectura de una imagen no confirma dinero recibido. No solicitar otro pago
            si la lectura es dudosa.</small
          >
        </div>`
      : ''}
    ${Number(o.importe_banco_verificado) > Number(o.total)
      ? /* HTML */ `<p>
          <strong
            >Cambio por coordinar:
            ${money(Number(o.importe_banco_verificado) - Number(o.total))}</strong
          >. Abono verificado: ${money(o.importe_banco_verificado)}. Coordinar y dejar
          constancia con el cliente desde Atención de WhatsApp.
        </p>`
      : ''}
    <small>Referencia: ${esc(o.id)}</small>${active
      ? /* HTML */ `<p>
          ${['pago_por_verificar', 'leyendo_comprobante'].includes(o.estado)
            ? 'Comprobante recibido. El plazo se detuvo y el stock sigue reservado mientras se verifica el abono.'
            : o.estado === 'pendiente_aprobacion'
              ? 'Pendiente de aprobación. No se ha reservado stock ni solicitado un pago. Atender antes de ' +
                time(o.reserva_hasta) +
                '.'
              : 'Stock reservado. Enviar comprobante hasta ' +
                time(o.reserva_hasta) +
                '.'}
        </p>`
      : ''}${o.venta_id ? '<p>Pago confirmado y venta registrada.</p>' : ''}${(
      o.comprobantes || []
    ).length
      ? /* HTML */ `<div class="pickup-proof">
          <h3>Comprobantes del pedido</h3>
          ${o.comprobantes
            .map(
              (c, n) =>
                /* HTML */ `<p>
                    Comprobante ${n + 1}:
                    ${c.importe == null ? 'Importe no legible' : money(c.importe)} ·
                    ${c.contabilizable
                      ? 'Incluido en la suma preliminar'
                      : 'Revisión manual necesaria'}<br />${esc(
                      c.lectura?.observacion || '',
                    )}
                  </p>
                  <button
                    data-order="archivo"
                    data-id="${esc(o.id)}"
                    data-proof="${esc(c.id)}"
                  >
                    Abrir comprobante ${n + 1}
                  </button>`,
            )
            .join('')}<small>Acceso privado para personal autorizado.</small>
        </div>`
      : o.comprobante_ruta
        ? /* HTML */ `<div class="pickup-proof">
            <h3>Comprobante</h3>
            <p>
              Importe leído:
              ${o.lectura?.importe == null ? 'No legible' : money(o.lectura.importe)}<br />Moneda:
              ${esc(o.lectura?.moneda)}<br />Destino: ${esc(o.lectura?.destino)}
            </p>
            <p>${esc(o.lectura?.observacion || '')}</p>
            <button data-order="archivo" data-id="${esc(o.id)}">Ver comprobante</button
            ><small>La imagen no acredita un abono bancario.</small>
          </div>`
        : ''}${o.estado === 'pago_por_verificar'
      ? /* HTML */ `<details class="pickup-payment-check">
          <summary>
            Verificar abonos en el
            banco${o.pago_revision === 'parcial'
              ? ' · la lectura indica un faltante'
              : ''}
          </summary>
          <p>
            Solo confirma si comprobaste el total completo en el banco. La suma preliminar
            de imágenes puede requerir corrección humana.
          </p>
          <div>
            <label
              >Importe total verificado en el banco (Bs)
              <input
                type="number"
                min="${esc(o.total)}"
                max="99999999"
                step="0.01"
                id="importe-banco-${esc(o.id)}"
                placeholder="Suma de los abonos reales"
            /></label>
            <label
              ><input type="checkbox" id="excedente-${esc(o.id)}" /> Si existe excedente,
              revisé el cambio pendiente y lo coordinaré con el cliente.</label
            >
            <label
              ><input type="checkbox" id="abono-${esc(o.id)}" /> Verifiqué en el banco el
              importe indicado en nuestra cuenta (debe cubrir ${money(o.total)}).</label
            >
          </div>
          <button
            class="primary"
            data-order="confirmar_pago"
            data-id="${esc(o.id)}"
            ${busy ? 'disabled' : ''}
          >
            Confirmar pago y registrar venta
          </button>
        </details>`
      : ''}${o.estado === 'pendiente_aprobacion'
      ? /* HTML */ `<button class="primary" data-order="aprobar" data-id="${esc(o.id)}">
          Aprobar, reservar y enviar QR
        </button>`
      : ''}
    <div class="toolbar">
      ${o.estado === 'pagado'
        ? /* HTML */ `<button class="primary" data-order="listo" data-id="${esc(o.id)}">
            Marcar preparado
          </button>`
        : ''}${o.estado === 'listo'
        ? /* HTML */ `<button
            class="primary"
            data-order="entregar"
            data-id="${esc(o.id)}"
          >
            Marcar entregado
          </button>`
        : ''}${active
        ? /* HTML */ `<button data-order="rechazar" data-id="${esc(o.id)}">
            Rechazar / liberar sin abono
          </button>`
        : ''}
    </div>
  </article>`;
}
function configForm() {
  return /* HTML */ `<details class="panel pickup-config">
    <summary>Información de la tienda · editar</summary>
    <form id="pickup-config-form">
      <div class="form-grid">
        <label
          >Nombre de la tienda<input
            name="nombre_tienda"
            required
            maxlength="80"
            value="${esc(settings.nombre_tienda)}" /></label
        ><label
          >Dirección exacta de recogida<input
            name="direccion"
            required
            maxlength="300"
            value="${esc(settings.direccion)}" /></label
        ><label
          ><input
            type="checkbox"
            name="ubicacion_confirmada"
            ${settings.ubicacion_confirmada ? 'checked' : ''}
          />
          Confirmo que esta es la dirección real de recogida</label
        ><label
          >Enlace de Google Maps<input
            type="url"
            name="mapa_url"
            value="${esc(settings.mapa_url)}"
            placeholder="https://..." /></label
        ><label
          >Contacto de la tienda<input
            name="telefono_contacto"
            maxlength="30"
            value="${esc(settings.telefono_contacto)}" /></label
        ><label
          >Información para clientes<textarea name="informacion" maxlength="1000">
${esc(settings.informacion)}</textarea
          >
        </label>
        <fieldset>
          <legend>Días</legend>
          ${['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
            .map(
              (d, i) =>
                /* HTML */ `<label
                  ><input
                    type="checkbox"
                    name="dias"
                    value="${i}"
                    ${(settings.dias || []).includes(i) ? 'checked' : ''}
                  />
                  ${d}</label
                >`,
            )
            .join('')}
        </fieldset>
        <label
          >Desde<input
            type="time"
            name="abre"
            required
            value="${esc(settings.abre.slice(0, 5))}" /></label
        ><label
          >Hasta<input
            type="time"
            name="cierra"
            required
            value="${esc(settings.cierra.slice(0, 5))}" /></label
        ><label
          >Preparación mínima (minutos)<input
            type="number"
            name="anticipacion_min"
            min="0"
            max="1440"
            required
            value="${settings.anticipacion_min}"
        /></label>
      </div>
      <p>
        Hasta ${settings.max_dias} días de anticipación. Los cambios se guardan en la base
        de datos y la IA los consulta automáticamente. Los pedidos anteriores conservan la
        fecha acordada. Las solicitudes se reciben hasta 10 minutos antes del cierre.
      </p>
      <button class="primary" ${busy ? 'disabled' : ''}>
        Guardar información de la tienda
      </button>
    </form>
  </details>`;
}
function paint() {
  const panel = document.querySelector('#pickup-orders');
  if (panel && connection?.user)
    panel.outerHTML = ordersView(connection, connection.user);
}
async function request(body, quiet = false) {
  if (busy || !connection?.client) return;
  busy = true;
  if (!quiet) {
    notice = '';
    paint();
  }
  try {
    const { data, error } = await connection.client.functions.invoke('nutri-ai/orders', {
      body,
    });
    if (error) {
      let message = 'No se pudieron actualizar los pedidos.';
      try {
        message = (await error.context.json()).error || message;
      } catch {}
      throw Error(message);
    }
    if (data.error) throw Error(data.error);
    if (body.action === 'archivo') {
      window.open(data.url, '_blank', 'noopener,noreferrer');
      return;
    }
    orders = data.pedidos || [];
    settings = data.configuracion || settings;
    if (body.action !== 'lista')
      notice =
        data.notification?.needsReview ||
        data.notification?.outsideWindow ||
        data.notification?.qr?.needsReview
          ? 'Cambio guardado. No se confirmó la entrega del aviso o QR por WhatsApp; revisa el envío antes de pedir el pago.'
          : 'Cambio guardado.';
  } catch (e) {
    notice = e.message;
  } finally {
    busy = false;
    paint();
  }
}
document.addEventListener(
  'click',
  (event) => {
    const button = event.target.closest('[data-order]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const action = button.dataset.order,
      id = button.dataset.id;
    const verified =
      action === 'confirmar_pago' &&
      document.querySelector('#abono-' + id)?.checked === true;
    if (action === 'confirmar_pago' && !verified) {
      notice = 'Revisa el abono en el banco y marca la casilla.';
      paint();
      return;
    }
    if (
      action === 'rechazar' &&
      !window.confirm(
        '¿Comprobaste que NO hubo abono? Esto cancela el pedido y libera sus productos. Si hubo pago, revisa primero cómo atenderlo.',
      )
    )
      return;
    const bankAmount = Number(document.querySelector('#importe-banco-' + id)?.value);
    const excessReviewed = document.querySelector('#excedente-' + id)?.checked === true;
    if (
      action === 'confirmar_pago' &&
      (!Number.isFinite(bankAmount) || bankAmount <= 0)
    ) {
      notice = 'Indica cuánto llegó realmente al banco antes de confirmar.';
      paint();
      return;
    }
    request({
      action,
      id,
      comprobante_id: button.dataset.proof || null,
      importe_banco_verificado: action === 'confirmar_pago' ? bankAmount : null,
      excedente_revisado: excessReviewed,
      abono_verificado: verified,
      sin_abono_verificado: action === 'rechazar',
    });
  },
  true,
);
document.addEventListener(
  'submit',
  (event) => {
    if (event.target.id !== 'pickup-config-form') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const form = new FormData(event.target);
    request({
      action: 'configurar',
      nombre_tienda: form.get('nombre_tienda'),
      direccion: form.get('direccion'),
      ubicacion_confirmada: form.get('ubicacion_confirmada') === 'on',
      mapa_url: form.get('mapa_url'),
      telefono_contacto: form.get('telefono_contacto'),
      informacion: form.get('informacion'),
      dias: form.getAll('dias').map(Number),
      abre: form.get('abre'),
      cierra: form.get('cierra'),
      anticipacion_min: Number(form.get('anticipacion_min')),
    });
  },
  true,
);
