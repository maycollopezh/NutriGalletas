const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const ycloud = 'https://ycloud.com/console/';
let store,
  userId,
  rows = [],
  busy = false,
  loaded = false,
  notice = '',
  timer;
export function whatsappInboxView(connection, user) {
  if (user?.rol !== 'administrador') return '';
  if (userId !== user.id) {
    userId = user.id;
    rows = [];
    loaded = false;
    notice = '';
  }
  store = connection;
  if (!loaded && store.client) {
    loaded = true;
    queueMicrotask(() => request('estado_atencion'));
  }
  if (!timer)
    timer = setInterval(() => {
      if (
        document.querySelector('#whatsapp-inbox') &&
        !busy &&
        !document.activeElement?.closest('#whatsapp-pause-form')
      )
        request('estado_atencion', null, true);
    }, 30000);
  const waiting = rows.filter((r) => r.solicita_atencion),
    paused = rows.filter((r) => r.estado === 'humano' && !r.solicita_atencion),
    active = rows.filter((r) => r.estado !== 'humano' && !r.solicita_atencion);
  return /* HTML */ `<section id="whatsapp-inbox">
    <div class="page-head">
      <div>
        <h1>
          Atención de WhatsApp
          ${waiting.length
            ? /* HTML */ `<span class="badge warn">${waiting.length} pendientes</span>`
            : ''}
        </h1>
        <p>Aquí aparecen los clientes que solicitan hablar con una persona.</p>
      </div>
      <button data-wa="estado_atencion" ${busy ? 'disabled' : ''}>Actualizar</button>
    </div>
    <p class="notice">
      Antes de responder desde YCloud, pausa la IA de ese cliente. Al terminar, pulsa
      «Reanudar IA». Cada conversación se controla por separado; los pedidos y pagos se
      gestionan en «Pedidos para recoger».
    </p>
    ${notice
      ? /* HTML */ `<p role="status" class="form-error">${esc(notice)}</p>`
      : ''}${!connection.client ? '<p>Necesitas una sesión conectada.</p>' : ''}${busy
      ? '<p role="status">Actualizando atención…</p>'
      : ''}
    <h2>Solicitudes de atención humana</h2>
    <div class="pickup-grid">
      ${waiting.map(card).join('') ||
      /* HTML */ `<section class="panel pickup-card">
        <p>No hay solicitudes pendientes de atención humana.</p>
      </section>`}
    </div>
    ${paused.length
      ? /* HTML */ `<h2>Conversaciones pausadas</h2>
          <div class="pickup-grid">${paused.map(card).join('')}</div>`
      : ''}
    <details class="panel pickup-config">
      <summary>Otras conversaciones · ${active.length}</summary>
      <div class="pickup-grid">
        ${active.map(card).join('') || '<p>No hay otras conversaciones recientes.</p>'}
      </div>
    </details>
    <form id="whatsapp-pause-form" class="panel pickup-config">
      <h2>Pausar por número</h2>
      <p>
        Si vas a atender a un cliente que todavía no aparece, introduce su WhatsApp con
        código de país.
      </p>
      <label
        >Número de WhatsApp<input
          name="telefono"
          type="tel"
          required
          placeholder="+591 70000000"
          maxlength="25" /></label
      ><button ${busy ? 'disabled' : ''}>Pausar IA para este número</button>
    </form>
  </section>`;
}
function card(row) {
  const paused = row.estado === 'humano';
  return /* HTML */ `<article class="panel pickup-card">
    <span class="badge ${paused ? 'warn' : ''}"
      >${row.solicita_atencion
        ? 'Solicitó atención humana'
        : paused
          ? 'IA pausada'
          : 'IA activa'}</span
    >
    <h3>+${esc(row.telefono)}</h3>
    ${row.motivo
      ? /* HTML */ `<p><strong>Solicitud:</strong> ${esc(row.motivo)}</p>`
      : ''}<small
      >Última actividad:
      ${new Date(row.actualizado_en).toLocaleString('es-BO', {
        timeZone: 'America/La_Paz',
      })}</small
    >
    <details>
      <summary>Ver últimos mensajes del cliente</summary>
      ${(row.historial || [])
        .slice(-4)
        .map(
          (m) =>
            /* HTML */ `<p class="whatsapp-preview">
              <small>${m.role === 'user' ? 'Cliente' : 'Asistente'}</small><br />${esc(
                m.content,
              )}
            </p>`,
        )
        .join('') || '<p>Sin mensajes disponibles.</p>'}
    </details>
    <div class="toolbar">
      <button data-wa="ycloud" data-phone="${esc(row.telefono)}">
        Responder por YCloud</button
      >${paused
        ? /* HTML */ `<button
            class="primary"
            data-wa="reanudar_cliente"
            data-phone="${esc(row.telefono)}"
          >
            Reanudar IA
          </button>`
        : /* HTML */ `<button data-wa="pausar_cliente" data-phone="${esc(row.telefono)}">
            Pausar IA
          </button>`}
    </div>
    <small
      >${paused
        ? 'La IA no responde mientras esta conversación está pausada.'
        : 'Pausa esta conversación antes de responder personalmente.'}</small
    >
  </article>`;
}
function paint() {
  const el = document.querySelector('#whatsapp-inbox');
  if (el && store?.user) el.outerHTML = whatsappInboxView(store, store.user);
}
async function request(action, telefono = null, quiet = false) {
  if (busy || !store?.client) return;
  const startedUser = userId;
  busy = true;
  if (!quiet) {
    notice = '';
    paint();
  }
  try {
    const { data, error } = await store.client.functions.invoke('nutri-ai/webchat', {
      body: { action, telefono },
    });
    if (error) {
      let message = 'No se pudo actualizar la atención de WhatsApp.';
      try {
        message = (await error.context.json()).error || message;
      } catch {}
      throw Error(message);
    }
    if (data.error) throw Error(data.error);
    if (startedUser !== userId || store.user?.id !== startedUser) return;
    rows = data.conversaciones || [];
    if (action !== 'estado_atencion')
      notice =
        action === 'pausar_cliente'
          ? 'IA pausada para este cliente. Ya puedes atenderlo desde YCloud.'
          : 'Atención cerrada. La IA volverá a responder a los próximos mensajes de este cliente.';
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
    const button = event.target.closest('[data-wa]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (button.dataset.wa === 'ycloud') {
      store.auditNavigation?.('atencion', 'ABRIR_YCLOUD');
      window.open(ycloud, '_blank', 'noopener,noreferrer');
      notice =
        'Busca el número +' +
        button.dataset.phone +
        ' en la bandeja de YCloud. Si vas a responder, asegúrate de que su IA esté pausada.';
      paint();
      return;
    }
    request(button.dataset.wa, button.dataset.phone);
  },
  true,
);
document.addEventListener(
  'submit',
  (event) => {
    if (event.target.id !== 'whatsapp-pause-form') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const phone = String(new FormData(event.target).get('telefono') || '').replace(
      /\D/g,
      '',
    );
    if (!/^[1-9][0-9]{7,14}$/.test(phone)) {
      notice =
        'Introduce el número completo con código de país, por ejemplo +59170000000.';
      paint();
      return;
    }
    request('pausar_cliente', phone);
  },
  true,
);
