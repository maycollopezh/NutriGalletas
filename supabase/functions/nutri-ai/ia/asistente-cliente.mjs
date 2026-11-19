import { customerInstructions } from './prompts/cliente.mjs';
import { normalize, resolveEntity, money, day } from '../compartido/operaciones.mjs';
import { pickupTime } from '../whatsapp/horario-recogida.mjs';
import { customerText } from '../respuestas/formato.mjs';
const tool = {
  type: 'function',
  name: 'atender_cliente',
  description:
    'Atiende al cliente con catálogo público y prepara solicitudes sin registrar ventas.',
  strict: true,
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      accion: { type: 'string', enum: ['conversar', 'solicitud', 'humano', 'estado'] },
      respuesta: {
        type: 'string',
        description:
          'Texto FINAL que leerá el cliente; nunca instrucciones, análisis ni explicación de cómo responder.',
      },
      aclaracion: {
        type: ['string', 'null'],
        description: 'Una pregunta directa al cliente si falta un dato.',
      },
      nombre: { type: ['string', 'null'] },
      fecha_recogida: {
        type: ['string', 'null'],
        description:
          'Día y hora de recogida expresados por el cliente, ISO con -04:00. Si la hora es ambigua, null.',
      },
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            producto: { type: 'string' },
            cantidad: { type: ['number', 'null'] },
          },
          required: ['producto', 'cantidad'],
        },
      },
    },
    required: ['accion', 'respuesta', 'aclaracion', 'nombre', 'fecha_recogida', 'items'],
  },
};
export async function interpretCustomer({
  key,
  model,
  message,
  history,
  context,
  catalog,
  requests,
  now = new Date(),
  fetcher = fetch,
}) {
  const instructions = customerInstructions(now);
  const response = await fetcher('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      store: false,
      instructions,
      input: JSON.stringify({
        catalogo: catalog,
        solicitudes_propias: requests,
        contexto: context,
        historial: history,
        mensaje: message,
      }),
      tools: [tool],
      tool_choice: { type: 'function', name: tool.name },
      parallel_tool_calls: false,
      max_output_tokens: 1100,
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok)
    throw Error(
      'El asistente está ocupado. Intenta más tarde o escribe «atención humana».',
    );
  const result = await response.json(),
    call = (result.output || []).find(
      (x) => x.type === 'function_call' && x.name === tool.name,
    );
  if (!call || result.status !== 'completed')
    throw Error('¿Puedes escribir tu consulta de forma más breve?');
  return JSON.parse(call.arguments);
}
export function scheduleLabel(cfg) {
  const names = [
    'domingo',
    'lunes',
    'martes',
    'miércoles',
    'jueves',
    'viernes',
    'sábado',
  ];
  return (
    (cfg?.dias || [1, 2, 3, 4, 5, 6]).map((d) => names[d]).join(', ') +
    ' de ' +
    String(cfg?.abre || '09:00').slice(0, 5) +
    ' a ' +
    String(cfg?.cierra || '19:00').slice(0, 5)
  );
}
function validPickup(value, cfg, now) {
  if (!/(Z|[+-]\d\d:\d\d)$/.test(value || '')) return false;
  const d = new Date(value),
    local = new Date(d.getTime() - 4 * 3600000),
    mins = local.getUTCHours() * 60 + local.getUTCMinutes(),
    toMins = (s) => {
      const [h, m] = String(s).split(':').map(Number);
      return h * 60 + m;
    };
  return (
    Number.isFinite(d.getTime()) &&
    d >= new Date(now.getTime() + (cfg?.anticipacion_min ?? 30) * 60000) &&
    d <= new Date(now.getTime() + (cfg?.max_dias ?? 7) * 86400000) &&
    (cfg?.dias || [1, 2, 3, 4, 5, 6]).includes(local.getUTCDay()) &&
    mins >= toMins(cfg?.abre || '09:00') &&
    mins <= toMins(cfg?.cierra || '19:00')
  );
}
const needsExplanation = (message) =>
  /\b(no entiendo|no comprendo|no entendi|explicame|explica|que significa|a que te refieres|como seria|como funciona|dame un ejemplo|por que me pides)\b/.test(
    normalize(message),
  );
const asksClarification = (message) =>
  /\b(no entiendo|no comprendo|no entendi|que significa (?:eso|esto)|a que te refieres|como (?:seria|debo responder)|dame un ejemplo|por que me pides)\b/.test(
    normalize(message),
  ) || /^(?:explica|explicame)(?: eso| esto)?[ .!?]*$/.test(normalize(message));
function nameAnswer(message) {
  const text = String(message || '')
    .trim()
    .replace(/^(?:me llamo|mi nombre es|a nombre de|soy)\s+/i, '')
    .trim();
  if (
    needsExplanation(text) ||
    /^(?:hola|quiero|necesito|cuanto|cuantos|como|que|por que|si|no|confirmar|cancelar|gracias|buenas)\b/i.test(
      normalize(text),
    )
  )
    return null;
  return text.length >= 2 && text.length <= 80 && /^[\p{L}][\p{L} .’'-]*$/u.test(text)
    ? text
    : null;
}
function knownName(history) {
  for (let i = history.length - 1; i > 0; i--)
    if (
      history[i].role === 'user' &&
      history[i - 1].role === 'assistant' &&
      /nombre/i.test(history[i - 1].content || '')
    ) {
      const value = nameAnswer(history[i].content);
      if (value) return value;
    }
  return null;
}
function clarificationReply(partial) {
  const waiting = partial.esperando;
  if (waiting?.campo === 'nombre' && !partial.nombre)
    return (
      'Solo necesito tu nombre para identificar la solicitud de compra; no voy a crear ' +
      'una cuenta.\n\nPor ejemplo, puedes responder: «Ana». ¿A nombre de quién la ' +
      'preparo?'
    );
  if (waiting?.campo === 'recogida')
    return 'Necesito el día y la hora en que vendrás a recoger el pedido en la tienda. Por ejemplo: «Mañana a las 10:00». No ofrecemos delivery.';
  if (waiting?.campo === 'cantidad')
    return `Me falta saber cuántos paquetes de ${waiting.producto} quieres.\n\nPor ejemplo: «Quiero 2 paquetes». Puedes indicar otra cantidad.`;
  if (waiting?.campo === 'producto')
    return (
      'Necesito saber qué galletas quieres y cuántos paquetes.\n\nPor ejemplo: «Quiero 2 ' +
      'paquetes de avena y miel». Es solo un ejemplo; dime el producto que prefieres.'
    );
  if (partial.nombre)
    return (
      'La solicitud es un resumen de las galletas que quieres comprar; no crea una ' +
      'cuenta ni registra un pago.\n\nSolo faltan los datos del producto o la cantidad ' +
      'que todavía no indicaste. Por ejemplo: «2 paquetes de avena y miel». Al final te ' +
      'mostraré el resumen para que decidas si enviarlo.'
    );
  return (
    'Te ayudo a preparar una solicitud de compra. Primero me dices qué galletas y ' +
    'cuántos paquetes; después tu nombre.\n\nEjemplo: «Quiero 2 paquetes de avena y ' +
    'miel». Al final verás el resumen y decidirás si lo confirmas; todavía no se ' +
    'registra una venta.'
  );
}
export function createPublicBrain({
  rpc,
  interpret,
  orders = null,
  now = () => new Date(),
}) {
  return async ({ sender, message, eventId, audioError = false }) => {
    const state = await rpc(sender, 'inicio', {
      evento: eventId,
      mensaje: message || '[Audio no legible]',
    });
    if (state.limitado) return { suppressed: true };
    if (state.duplicado) return state.respuesta || { suppressed: true };
    let reply,
      pedido = null,
      enviar_qr = false,
      context = state.contexto || {},
      suppressed = state.estado === 'humano';
    const previous = context.parcial || {};
    if (!previous.nombre) previous.nombre = knownName(state.historial || []);
    if (context.parcial) context = { ...context, parcial: previous };
    const cmd = normalize(message)
      .replace(/[¿?¡!.,]/g, '')
      .trim();
    try {
      if (suppressed) reply = '';
      else if (audioError)
        reply = 'Tu audio supera los 2 MB. Envía uno más corto o escribe tu consulta.';
      else if (
        /humano|persona real|hablar con (?:una persona|alguien|el encargado|el administrador)|atencion personal|reclamo/.test(
          cmd,
        )
      ) {
        await rpc(sender, 'humano', { mensaje: message });
        context = {};
        reply =
          'Dejé tu solicitud de atención para el equipo. Te responderán por este WhatsApp ' +
          'según su disponibilidad. El asistente queda pausado para tu número mientras te ' +
          'atienden.';
      } else if (['confirmar', 'confirmo'].includes(cmd)) {
        context = {};
        const saved = await rpc(sender, 'confirmar');
        pedido = saved;
        reply =
          'Solicitud enviada al equipo\n\nReferencia: ' +
          `${saved.id}` +
          '\nTotal: ' +
          `${money(saved.total)}` +
          '\nRecogida: ' +
          `${new Date(saved.fecha_recogida).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}` +
          '\n\nUn cajero o administrador revisará tu solicitud en la web. Todavía no debes ' +
          'pagar y los productos no están reservados. Si se aprueba, recibirás el QR y ' +
          'tendrás 10 minutos para pagar y enviar la imagen del comprobante. Si no se ' +
          'atiende en 30 minutos o antes del cierre, deberás volver a solicitarla.';
      } else if (['cancelar', 'descartar'].includes(cmd)) {
        if (orders && !context.propuesta) await orders(sender, 'cancelar');
        context = {};
        reply =
          'Descarté la propuesta o cancelé tu reserva pendiente sin pago. ¿En qué más te ayudo?';
      } else if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches)$/.test(cmd))
        reply =
          '¡Hola! Bienvenido a NutriGalletas. Puedo ayudarte con nuestras galletas, precios o una solicitud de compra. ¿Qué buscas?';
      else if (
        /^(?:qr|enviame (?:el )?qr|codigo qr|mandame (?:el )?qr)$/.test(cmd) &&
        orders
      ) {
        pedido = await orders(sender, 'actual');
        if (
          pedido.estado !== 'esperando_comprobante' &&
          !(pedido.estado === 'pago_por_verificar' && pedido.pago_revision === 'parcial')
        )
          reply =
            'No hay una reserva esperando comprobante. Si ya lo enviaste, espera la verificación del banco y no vuelvas a pagar.';
        else {
          enviar_qr = true;
          reply =
            pedido.pago_revision === 'parcial'
              ? `El pedido suma ${money(pedido.total)}. Se leyeron ${money(pedido.total_comprobantes)} en comprobantes distintos. Falta ${money(pedido.faltante)}. Paga solo esa diferencia y envía el nuevo comprobante; conservamos tu reserva durante la revisión.`
              : `Pago para tu reserva ${pedido.id}\n\nImporte exacto: ${money(pedido.total)}\nReserva hasta: ${new Date(pedido.reserva_hasta).toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz' })}. Envía la imagen del comprobante dentro del plazo.`;
        }
      } else if (asksClarification(message)) {
        reply = context.propuesta
          ? 'El resumen muestra los productos, cantidades y precio de tu solicitud. No ' +
            'registra un pago ni reserva stock.\n\nSi todo está correcto, responde «CONFIRMAR» ' +
            'para enviarla al equipo; si no, responde «CANCELAR».'
          : clarificationReply(previous);
        if (previous.nombre && !context.propuesta)
          reply =
            'Ya tengo tu nombre: ' +
            previous.nombre +
            '.\n\n' +
            clarificationReply(previous);
        context = { ...context, parcial: previous };
      } else {
        const catalog = await rpc(sender, 'catalogo');
        let intent;
        const ordinal = normalize(message).match(
          /\b(primera|primer|1ra|1era|segunda|segundo|2da|tercera|tercer|3ra|cuarta|cuarto|4ta|quinta|quinto|5ta|sexta|sexto|6ta)\b/,
        );
        let selected = null;
        if (ordinal) {
          const source =
            [...(state.historial || [])].reverse().find((x) => x.role === 'assistant')
              ?.content || '';
          const list = Array.isArray(context.opciones)
            ? context.opciones
            : catalog.productos
                .map((p) => ({
                  nombre: p.nombre,
                  pos: normalize(source).indexOf(normalize(p.nombre)),
                }))
                .filter((p) => p.pos >= 0)
                .sort((a, b) => a.pos - b.pos)
                .map((p) => p.nombre);
          const index = /^(prim|1)/.test(ordinal[1])
            ? 0
            : /^(seg|2)/.test(ordinal[1])
              ? 1
              : /^(ter|3)/.test(ordinal[1])
                ? 2
                : /^(cuar|4)/.test(ordinal[1])
                  ? 3
                  : /^(quin|5)/.test(ordinal[1])
                    ? 4
                    : 5;
          if (!list[index])
            throw Error(
              '¿A qué galleta te refieres? Dime su nombre para evitar elegir otra por error.',
            );
          selected = {
            producto: list[index],
            cantidad: Number(normalize(message).match(/(\d+)\s*paquetes?/)?.[1]) || null,
          };
        }
        const suppliedName =
          previous.esperando?.campo === 'nombre' ? nameAnswer(message) : null;
        const suppliedQuantity =
          previous.esperando?.campo === 'cantidad'
            ? String(message || '')
                .trim()
                .match(/^(?:quiero\s+)?(\d+)\s*(?:paquetes?)?$/i)
            : null;
        const pickupAnswer =
          (previous.items || []).length &&
          (previous.esperando?.campo === 'recogida' ||
            /(?:a las|\d{1,2}:\d{2}|\d\s*[ap]\.?m)/i.test(message || ''))
            ? pickupTime(message, previous.horario || {}, now())
            : null;
        if (pickupAnswer)
          intent = {
            accion: 'solicitud',
            nombre: previous.nombre,
            fecha_recogida: pickupAnswer.value || null,
            items: previous.items || [],
          };
        else if (selected)
          intent = {
            accion: 'solicitud',
            nombre: previous.nombre,
            fecha_recogida: previous.fecha_recogida,
            items: [selected],
          };
        else if (suppliedName)
          intent = {
            accion: 'solicitud',
            nombre: suppliedName,
            fecha_recogida: previous.fecha_recogida,
            items: previous.items || [],
          };
        else if (suppliedQuantity)
          intent = {
            accion: 'solicitud',
            nombre: previous.nombre,
            fecha_recogida: previous.fecha_recogida,
            items: (previous.items || []).map((x) =>
              normalize(x.producto) === normalize(previous.esperando.producto)
                ? { ...x, cantidad: Number(suppliedQuantity[1]) }
                : x,
            ),
          };
        else {
          await rpc(sender, 'consumo');
          intent = await interpret({
            message,
            history: state.historial || [],
            context: { ...context, parcial: previous, pedido_actual: state.pedido },
            catalog,
            requests: state.solicitudes || [],
            now: now(),
          });
        }
        if (intent.accion === 'humano') {
          await rpc(sender, 'humano', { mensaje: message });
          context = {};
          reply =
            'Tu solicitud pasó al equipo para atención humana. Responderán por este WhatsApp según disponibilidad. La IA queda pausada para tu número.';
        } else if (intent.accion === 'solicitud') {
          const cfg = catalog.configuracion_recogida,
            local = new Date(now().getTime() - 4 * 3600000),
            minute = local.getUTCHours() * 60 + local.getUTCMinutes(),
            toMin = (x) => {
              const [h, m] = String(x).split(':').map(Number);
              return h * 60 + m;
            };
          if (
            !(cfg?.dias || [1, 2, 3, 4, 5, 6]).includes(local.getUTCDay()) ||
            minute < toMin(cfg?.abre || '09:00') ||
            minute >= toMin(cfg?.cierra || '19:00') - 10
          )
            throw Error(
              `Ahora no recibimos pedidos para recoger. Atendemos ${scheduleLabel(cfg)}; recibimos solicitudes hasta 10 minutos antes del cierre para poder revisar el pago. Puedo ayudarte a conocer el catálogo mientras tanto.`,
            );
          const entering = (intent.items || []).length
            ? intent.items
            : previous.items || [];
          const merged = entering.map((x) => {
            const old = (previous.items || []).find(
              (y) => normalize(y.producto) === normalize(x.producto),
            );
            return { ...x, cantidad: x.cantidad ?? old?.cantidad ?? null };
          });
          const explicitName = /^(?:me llamo|mi nombre es|a nombre de|soy)\s/i.test(
            String(message || ''),
          )
            ? nameAnswer(message)
            : null;
          const name =
            suppliedName ||
            explicitName ||
            previous.nombre ||
            intent.nombre?.trim() ||
            null;
          const pickup = pickupAnswer
            ? pickupAnswer.value || null
            : intent.fecha_recogida || previous.fecha_recogida || null;
          context = {
            parcial: {
              nombre: name,
              items: merged,
              fecha_recogida: pickup,
              horario: pickupAnswer?.slot || previous.horario || {},
            },
          };
          let missing = null;
          for (const item of merged) {
            try {
              const product = resolveEntity(item.producto, catalog.productos, 'producto');
              item.producto = product.nombre;
            } catch (e) {
              missing = { campo: 'producto' };
              reply = customerText(e.message);
              break;
            }
            if (
              !Number.isSafeInteger(item.cantidad) ||
              item.cantidad < 1 ||
              item.cantidad > 100000
            ) {
              missing = { campo: 'cantidad', producto: item.producto };
              reply = `¿Cuántos paquetes de ${item.producto} quieres? Por ejemplo: «2 paquetes».`;
              break;
            }
          }
          if (!merged.length) {
            missing = { campo: 'producto' };
            reply =
              '¿Qué galletas quieres? Por ejemplo: «Avena y miel». Después te pediré cuántos paquetes.';
          } else if (!missing && !pickup) {
            missing = { campo: 'recogida' };
            const cfg = catalog.configuracion_recogida;
            reply =
              pickupAnswer?.question ||
              `¿Qué día y a qué hora vendrás a recoger? Solo recogida en tienda. Horario: ${scheduleLabel(cfg)}. Necesitamos ${cfg?.anticipacion_min ?? 30} minutos de anticipación. Por ejemplo: «Mañana a las 10:00».`;
          } else if (
            !missing &&
            !validPickup(pickup, catalog.configuracion_recogida, now())
          ) {
            missing = { campo: 'recogida' };
            reply = `Elige una fecha y hora de recogida dentro de ${scheduleLabel(catalog.configuracion_recogida)}, con al menos ${catalog.configuracion_recogida?.anticipacion_min ?? 30} minutos de anticipación y dentro de los próximos ${catalog.configuracion_recogida?.max_dias ?? 7} días.`;
            context.parcial.fecha_recogida = null;
          } else if (!missing && !name) {
            missing = { campo: 'nombre' };
            reply =
              '¿A nombre de quién preparo la solicitud? Solo necesito tu nombre, por ejemplo: «Ana».';
          }
          if (missing) context.parcial.esperando = missing;
          else {
            intent = { ...intent, nombre: name, items: merged };
            const items = intent.items.map((x) => {
              const p = resolveEntity(x.producto, catalog.productos, 'producto');
              if (
                !Number.isSafeInteger(x.cantidad) ||
                x.cantidad <= 0 ||
                x.cantidad > 100000
              )
                throw Error('¿Cuántos paquetes necesitas? Indica una cantidad entera.');
              return {
                producto_id: p.id,
                nombre: p.nombre,
                cantidad: x.cantidad,
                precio: Number(p.precio_venta),
              };
            });
            if (items.length > 15)
              throw Error('Indica como máximo 15 productos por solicitud.');
            const total =
              Math.round(items.reduce((n, x) => n + x.cantidad * x.precio, 0) * 100) /
              100;
            const resumen = `Solicitud de compra\n\nNombre: ${intent.nombre.trim().slice(0, 100)}\n${items.map((x) => `• ${x.nombre}: ${x.cantidad} paquetes × ${money(x.precio)}`).join('\n')}\n\nTotal: ${money(total)}\nRecogida en tienda: ${new Date(pickup).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}`;
            context = {
              propuesta: {
                solicitud_id: crypto.randomUUID(),
                fecha_recogida: pickup,
                nombre: intent.nombre.trim().slice(0, 100),
                items,
                resumen,
                vence: new Date(now().getTime() + 600000).toISOString(),
              },
            };
            reply =
              resumen +
              ('\n\nResponde CONFIRMAR para enviar la solicitud al equipo, o CANCELAR para ' +
                'descartar. Cuando un cajero o administrador la apruebe, reservaremos los ' +
                'productos y te enviaremos el QR: tendrás 10 minutos para pagar y enviar la ' +
                'imagen del comprobante. Este resumen aún no reserva productos y vence en 10 ' +
                'minutos.');
          }
        } else {
          if (!context.parcial && !context.propuesta) context = {};
          reply = customerText(
            intent.respuesta,
            'Puedo ayudarte con las galletas y precios de NutriGalletas. ¿Qué necesitas?',
          );
        }
      }
    } catch (e) {
      reply = customerText(
        e.message,
        'No pude completar tu consulta. Puedes pedir atención humana.',
      );
    }
    reply = customerText(reply, '');
    if (reply && !context.propuesta) {
      const catalog = await rpc(sender, 'catalogo');
      const listed = catalog.productos
        .map((p) => ({
          nombre: p.nombre,
          pos: normalize(reply).indexOf(normalize(p.nombre)),
        }))
        .filter((p) => p.pos >= 0)
        .sort((a, b) => a.pos - b.pos)
        .map((p) => p.nombre);
      if (listed.length > 1) context = { ...context, opciones: listed };
      else if (
        context.opciones == null &&
        state.contexto?.opciones &&
        !['cancelar', 'descartar', 'confirmar', 'confirmo'].includes(cmd)
      )
        context = { ...context, opciones: state.contexto.opciones };
    }
    await rpc(sender, 'finalizar', {
      evento: eventId,
      respuesta: reply,
      contexto: context,
      silencio: suppressed,
      pedido,
      enviar_qr,
    });
    return { reply, suppressed, pedido, enviar_qr };
  };
}
