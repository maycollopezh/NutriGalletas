// Bandeja administrativa del historial central; el navegador no escribe cambios de negocio.
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const acciones = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'INICIAR_SESION',
  'REVOCAR_SESION',
  'ACCESO_FALLIDO',
  'SOLICITAR_RECUPERACION',
  'VISITAR_PANTALLA',
  'CONSULTAR_DETALLE',
  'ABRIR_YCLOUD',
  'EXPORTAR_LOG',
];
const etiquetas = {
  INSERT: 'Creación',
  UPDATE: 'Modificación',
  DELETE: 'Eliminación',
  INICIAR_SESION: 'Inicio de sesión',
  REVOCAR_SESION: 'Sesión revocada',
  ACCESO_FALLIDO: 'Intento de acceso fallido',
  SOLICITAR_RECUPERACION: 'Solicitud de recuperación',
  VISITAR_PANTALLA: 'Visita a pantalla',
  CONSULTAR_DETALLE: 'Consulta de detalle',
  ABRIR_YCLOUD: 'Apertura de YCloud',
  EXPORTAR_LOG: 'Descarga de log',
};
let store,
  actor,
  usuarios = [],
  rows = [],
  loaded = false,
  busy = false,
  exporting = false,
  notice = '',
  more = false,
  cursor = null,
  filtros = { desde: '', hasta: '', usuario: '', accion: '' };
export function auditView(connection, user, profiles = []) {
  if (user?.rol !== 'administrador') return '';
  if (actor !== user.id) {
    actor = user.id;
    rows = [];
    loaded = false;
    busy = false;
    exporting = false;
    more = false;
    cursor = null;
    notice = '';
    filtros = { desde: '', hasta: '', usuario: '', accion: '' };
  }
  store = connection;
  usuarios = profiles;
  if (!loaded && store.client) {
    loaded = true;
    queueMicrotask(() => load());
  }
  return /* HTML */ `<section id="audit-panel">
    <div class="page-head">
      <div>
        <h1>Auditoría</h1>
        <p>Actividad de todos los usuarios · horario de Bolivia.</p>
      </div>
      <div class="toolbar">
        <button data-audit="refresh" ${busy || exporting ? 'disabled' : ''}>
          Actualizar</button
        ><button
          class="primary"
          data-audit="export"
          ${busy || exporting || !store.client ? 'disabled' : ''}
        >
          ${exporting ? 'Preparando…' : 'Descargar .log'}
        </button>
      </div>
    </div>
    <p class="notice">
      Los cambios confirmados se registran en el servidor. Las visitas y consultas se
      identifican como información enviada por el navegador. Historial disponible desde la
      activación de esta función.
    </p>
    <form id="audit-filters" class="panel audit-filters">
      <label>Desde<input name="desde" type="date" value="${esc(filtros.desde)}" /></label
      ><label>Hasta<input name="hasta" type="date" value="${esc(filtros.hasta)}" /></label
      ><label
        >Usuario<select name="usuario">
          <option value="">Todos</option>
          ${usuarios
            .map(
              (u) =>
                `<option value="${esc(u.id)}" ${filtros.usuario === u.id ? 'selected' : ''}>${esc(u.nombre)}</option>`,
            )
            .join('')}
        </select></label
      ><label
        >Acción<select name="accion">
          <option value="">Todas</option>
          ${acciones
            .map(
              (a) =>
                `<option value="${a}" ${filtros.accion === a ? 'selected' : ''}>${etiquetas[a]}</option>`,
            )
            .join('')}
        </select></label
      ><button ${busy || exporting ? 'disabled' : ''}>Aplicar filtros</button>
    </form>
    <p role="status">${esc(notice)}${busy ? ' Cargando historial…' : ''}</p>
    ${!store.client
      ? '<p>El modo demostración no registra auditoría central. Inicia sesión en el sistema conectado.</p>'
      : ''}
    <div class="panel audit-table">
      <table>
        <thead>
          <tr>
            <th>Fecha y hora</th>
            <th>Usuario / rol</th>
            <th>Acción</th>
            <th>Registro</th>
            <th>Origen / resultado</th>
            <th>Detalle</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row).join('') ||
          '<tr><td colspan="6">Sin registros para estos filtros.</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="toolbar">
      <button data-audit="first" ${!cursor || busy || exporting ? 'disabled' : ''}>
        Más recientes</button
      ><button data-audit="next" ${!more || busy || exporting ? 'disabled' : ''}>
        Anteriores</button
      ><small
        >Hasta 100 eventos por página. Actualización automática cada 15 segundos en la
        primera página.</small
      >
    </div>
  </section>`;
}
function row(r) {
  return `<tr><td>${esc(new Date(r.fecha).toLocaleString('es-BO', { timeZone: 'America/La_Paz' }))}</td><td>${esc(r.nombre)}<br><small>${esc(r.rol)}</small></td><td>${esc(etiquetas[r.accion] || r.accion)}</td><td>${esc(r.entidad)}<br><small>${esc(r.registro || '—')}</small></td><td>${esc(r.origen)}<br><small>${esc(r.resultado)}</small></td><td><details><summary>Ver cambios</summary><p>Campos: ${esc((r.campos || []).join(', ') || 'No aplica')}</p>${r.antes ? `<b>Antes</b><pre>${esc(JSON.stringify(r.antes, null, 2))}</pre>` : ''}${r.despues ? `<b>Después</b><pre>${esc(JSON.stringify(r.despues, null, 2))}</pre>` : ''}<small>Evento ${esc(r.id)} · transacción ${esc(r.transaccion)}</small></details></td></tr>`;
}
function paint() {
  const el = document.querySelector('#audit-panel');
  if (el && store.user?.id === actor)
    el.outerHTML = auditView(store, store.user, usuarios);
}
function args() {
  return {
    p_desde: filtros.desde || null,
    p_hasta: filtros.hasta || null,
    p_usuario: filtros.usuario || null,
    p_accion: filtros.accion || null,
  };
}
async function query(parameters) {
  const { data, error } = await store.client.rpc('consultar_auditoria', parameters);
  if (error)
    throw Error(
      error.code === 'PGRST202'
        ? 'Falta activar la migración de auditoría en Supabase.'
        : error.message,
    );
  return data;
}
async function load(quiet = false) {
  if (busy || exporting || !store?.client) return;
  const who = actor;
  busy = true;
  if (!quiet) {
    notice = '';
    paint();
  }
  try {
    const result = await query({ ...args(), p_antes: cursor });
    if (store.user?.id !== who || actor !== who) return;
    rows = result.registros;
    more = result.hay_mas;
  } catch (e) {
    if (actor === who) notice = e.message;
  } finally {
    if (actor === who) {
      busy = false;
      paint();
    }
  }
}
async function download() {
  if (busy || exporting || !store?.client) return;
  const who = actor;
  exporting = true;
  notice = '';
  paint();
  try {
    let all = [],
      before = null,
      ceiling = null;
    do {
      const result = await query({
        ...args(),
        p_antes: before,
        p_limite: 500,
        p_exportar: before === null,
        p_tope: ceiling,
      });
      if (store.user?.id !== who || actor !== who) return;
      all.push(...result.registros);
      if (all.length > 50000)
        throw Error(
          'Hay más de 50.000 eventos. Reduce el rango de fechas para descargar un archivo completo.',
        );
      if (!result.hay_mas) break;
      if (!result.registros.length)
        throw Error('La descarga quedó incompleta. Inténtalo nuevamente.');
      ceiling ??= result.registros[0].id;
      before = result.registros.at(-1).id;
    } while (true);
    const content =
      [
        {
          formato: 'NutriGalletas auditoría JSONL v1',
          exportado_en: new Date().toISOString(),
          zona: 'America/La_Paz',
          filtros,
          total: all.length,
        },
        ...all,
      ]
        .map((r) => JSON.stringify(r))
        .join('\n') + '\n';
    const url = URL.createObjectURL(
      new Blob([content], { type: 'text/plain;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `NutriGalletas_auditoria_${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice = `Archivo completo descargado: ${all.length} eventos.`;
  } catch (e) {
    if (actor === who) notice = e.message;
  } finally {
    if (actor === who) {
      exporting = false;
      paint();
    }
  }
}
document.addEventListener(
  'submit',
  (event) => {
    if (event.target.id !== 'audit-filters') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (busy || exporting) return;
    const f = new FormData(event.target);
    filtros = Object.fromEntries(
      ['desde', 'hasta', 'usuario', 'accion'].map((k) => [k, String(f.get(k) || '')]),
    );
    cursor = null;
    load();
  },
  true,
);
document.addEventListener(
  'click',
  (event) => {
    const button = event.target.closest('[data-audit]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (button.dataset.audit === 'export') return void download();
    if (button.dataset.audit === 'next') cursor = rows.at(-1)?.id || null;
    else cursor = null;
    load();
  },
  true,
);
setInterval(() => {
  if (
    document.querySelector('#audit-panel') &&
    !document.hidden &&
    !cursor &&
    !busy &&
    !exporting &&
    !document.activeElement?.closest('#audit-filters') &&
    !document.querySelector('#audit-panel details[open]')
  )
    load(true);
}, 15000);
