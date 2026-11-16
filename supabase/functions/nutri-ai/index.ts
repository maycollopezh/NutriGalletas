import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import nodemailer from 'npm:nodemailer@10.3.1';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';
import { Buffer } from 'node:buffer';
import { receiptContent, type Receipt } from '../receipt-email/handler.ts';
import { createBrain, openAIIntent, openAIAnswer } from './brain.mjs';
import { inventoryAlert, briefFinance, customerText } from './presentation.mjs';
import { readReceiptImage } from './pickup-media.mjs';
import { createPublicBrain, interpretCustomer } from './public-brain.mjs';
import { day, formatReport } from './core.mjs';
import {
  equal,
  phone,
  verifyEvent,
  audioUrl,
  proofFor,
  verifyProof,
} from './security.mjs';
const env = (name: string) => Deno.env.get(name) || '';
const url = env('SUPABASE_URL'),
  service = env('SUPABASE_SERVICE_ROLE_KEY'),
  anon = env('SUPABASE_ANON_KEY');
const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const adminId = env('IA_ADMIN_USER_ID') || '59d0d5e2-fff9-446a-aecc-3152efc4fe5d';
const adminPhone = phone(env('IA_ADMIN_WHATSAPP')),
  businessPhone = phone(env('YCLOUD_BUSINESS_PHONE'));
const cors = {
  'Access-Control-Allow-Origin': env('APP_ORIGIN'),
  'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
  'Cache-Control': 'no-store',
};
async function rpc(user: string, channel: string, action: string, data: unknown = {}) {
  const r = await admin.rpc('ia_servicio', {
    p_usuario: user,
    p_canal: channel,
    p_accion: action,
    p_datos: data,
  });
  if (r.error)
    throw Error(
      r.error.code === 'PGRST202'
        ? 'Falta activar la actualización 006 del asistente.'
        : r.error.message,
    );
  return r.data;
}
const brain = createBrain({
  rpc,
  interpret: (
    message: string,
    history: unknown[],
    catalog: unknown,
    now: Date,
    context: unknown,
  ) =>
    openAIIntent({
      key: env('OPENAI_API_KEY'),
      model: env('OPENAI_MODEL') || 'gpt-5.4-mini',
      message,
      history,
      catalog,
      now,
      context,
    }),
  compose: (input: any) =>
    openAIAnswer({
      key: env('OPENAI_API_KEY'),
      model: env('OPENAI_MODEL') || 'gpt-5.4-mini',
      ...input,
    }),
});
async function publicRpc(sender: string, action: string, data: unknown = {}) {
  const result = await admin.rpc('ia_atencion_publica', {
    p_telefono: sender,
    p_accion: action,
    p_datos: data,
  });
  if (result.error)
    throw Error(
      result.error.code === 'PGRST202'
        ? 'La atención de clientes está en preparación. Intenta más tarde.'
        : result.error.message,
    );
  return result.data;
}
async function ordersRpc(
  sender: string,
  action: string,
  data: unknown = {},
  actor: string | null = null,
) {
  const result = await admin.rpc('gestionar_pedido_whatsapp', {
    p_telefono: sender,
    p_accion: action,
    p_datos: data,
    p_actor: actor,
  });
  if (result.error) throw Error(result.error.message);
  return result.data;
}
const publicBrain = createPublicBrain({
  rpc: publicRpc,
  orders: ordersRpc,
  interpret: (input: any) =>
    interpretCustomer({
      key: env('OPENAI_API_KEY'),
      model: env('OPENAI_MODEL') || 'gpt-5.4-mini',
      ...input,
    }),
});
async function webUser(req: Request) {
  if (req.headers.get('origin') !== env('APP_ORIGIN')) throw Error('Acceso denegado');
  const token = req.headers.get('authorization')?.replace(/^Bearer /i, '') || '';
  const verified = await admin.auth.getUser(token);
  if (verified.error || !verified.data.user) throw Error('Acceso denegado');
  const client = createClient(url, anon, {
    global: { headers: { Authorization: 'Bearer ' + token } },
    auth: { persistSession: false },
  });
  const role = await client.rpc('rol_actual');
  if (role.error || role.data !== 'administrador' || verified.data.user.id !== adminId)
    throw Error('Acceso denegado');
  return verified.data.user.id;
}
function makeAccess(req: Request) {
  const secret = env('MAKE_WEBHOOK_SECRET');
  if (!secret || !equal(req.headers.get('x-make-secret'), secret))
    throw Error('Acceso denegado');
}
async function sendWhatsApp(
  text: string,
  jobKey: string,
  template = false,
  recipient = adminPhone,
  imageLink: string | null = null,
) {
  if (!/^[1-9][0-9]{7,14}$/.test(recipient)) throw Error('Destino inválido');
  if (env('IA_WHATSAPP_ENABLED') !== 'true') return { paused: true };
  // El propietario rechazó envíos de plantillas pagadas fuera de ventana.
  if (template) return { outsideWindow: true };
  const reservation = await rpc(adminId, 'whatsapp', 'envio', {
    clave: jobKey,
    tipo: 'whatsapp',
  });
  if (!reservation.nuevo) return { duplicate: true };
  try {
    const key = env('YCLOUD_API_KEY');
    if (!key) throw Error('Falta la conexión de YCloud');
    const body: any = {
      from: '+' + businessPhone,
      to: '+' + recipient,
      type: 'text',
      text: { body: text.slice(0, 4000) },
    };
    if (imageLink) {
      delete body.text;
      body.type = 'image';
      body.image = { link: imageLink, caption: text.slice(0, 1000) };
    }
    if (template) {
      if (!env('YCLOUD_ALERT_TEMPLATE'))
        throw Error('Falta aprobar la plantilla de alertas');
      delete body.text;
      body.type = 'template';
      body.template = {
        name: env('YCLOUD_ALERT_TEMPLATE'),
        language: { code: 'es' },
        components: [
          {
            type: 'body',
            parameters: [
              {
                type: 'text',
                text: text
                  .replace(/[\r\n\t]+/g, ' · ')
                  .replace(/ {2,}/g, ' ')
                  .slice(0, 800),
              },
            ],
          },
        ],
      };
    }
    const res = await fetch('https://api.ycloud.com/v2/whatsapp/messages/sendDirectly', {
      method: 'POST',
      headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw Error('YCloud rechazó el envío');
    const out = await res.json();
    await rpc(adminId, 'whatsapp', 'envio_fin', {
      clave: jobKey,
      estado: 'aceptado',
      proveedor_id: out.id || out.wamid,
    });
    return { accepted: true };
  } catch (caught) {
    const e = caught instanceof Error ? caught : new Error('Error del servicio');
    await rpc(adminId, 'whatsapp', 'envio_fin', {
      clave: jobKey,
      estado: e.name === 'TimeoutError' ? 'incierto' : 'fallido',
      detalle: e.message,
    });
    throw e;
  }
}
async function preflight(raw: string, req: Request) {
  if (!/^591[67]\d{7}$/.test(adminPhone) || !/^591[67]\d{7}$/.test(businessPhone))
    throw Error('Falta configurar los números de WhatsApp');
  const event = verifyEvent(
    raw,
    req.headers.get('ycloud-signature'),
    env('YCLOUD_SIGNING_SECRET'),
  );
  if (event.type !== 'whatsapp.inbound_message.received') return { ignored: true };
  const m = event.whatsappInboundMessage;
  if (
    !m?.id ||
    phone(m.to) !== businessPhone ||
    !/^[1-9][0-9]{7,14}$/.test(phone(m.from))
  )
    return { ignored: true };
  const sender = phone(m.from);
  const state =
    sender === adminPhone ? await rpc(adminId, 'whatsapp', 'estado') : { estado: 'bot' };
  if (state.estado !== 'bot') {
    await rpc(adminId, 'whatsapp', 'historial', {
      role: 'user',
      content:
        m.type === 'text'
          ? String(m.text?.body || '').slice(0, 2000)
          : '[Audio disponible en YCloud Inbox]',
    });
    return { ignored: true, humanAttention: true };
  }
  const p: any = { sender, eventId: String(m.id), type: m.type, at: Date.now() };
  if (m.type === 'text') p.text = String(m.text?.body || '').slice(0, 2000);
  else if (m.type === 'audio') p.audioUrl = audioUrl(m.audio?.link);
  else if (m.type === 'image') {
    p.type = 'text';
    p.text = '__NUTRI_COMPROBANTE_IMAGEN__';
    p.audioUrl = audioUrl(m.image?.link);
  } else {
    p.type = 'text';
    p.text =
      '[Mensaje de tipo ' +
      String(m.type).slice(0, 30) +
      '. Explica brevemente que para esta solicitud necesito texto o audio, sin afirmar que viste su contenido.]';
  }
  p.proof = proofFor(p, env('MAKE_WEBHOOK_SECRET'));
  return p;
}
async function receiptAfterConfirmation(output: any) {
  const sale = output.result;
  if (!sale?.correo_cliente || !sale?.numero) return output;
  const key = 'recibo-ia:' + sale.id;
  try {
    const reservation = await rpc(adminId, 'web', 'envio', {
      clave: key,
      tipo: 'recibo',
    });
    if (!reservation.nuevo) return output;
    const details = await admin
      .from('detalle_ventas')
      .select(
        'cantidad,precio_unitario,productos(nombre),lotes_inventario(codigo_lote,fecha_vencimiento)',
      )
      .eq('venta_id', sale.id);
    if (details.error) throw Error('No se pudo cargar el recibo');
    const receipt = {
      ...sale,
      fecha: new Date(sale.fecha).toLocaleString('es-BO', { timeZone: 'America/La_Paz' }),
      vendedor: 'Administrador NutriGalletas',
      detalles: details.data.map((x: any) => ({
        producto: x.productos.nombre,
        lote: x.lotes_inventario.codigo_lote,
        vencimiento: x.lotes_inventario.fecha_vencimiento,
        cantidad: x.cantidad,
        precio: x.precio_unitario,
      })),
    } as Receipt;
    const content = receiptContent(receipt),
      pdf = await PDFDocument.create(),
      font = await pdf.embedFont(StandardFonts.Helvetica);
    let page = pdf.addPage([595, 842]),
      y = 790;
    for (const raw of content.lines) {
      const line = raw.replace(/[^\x20-\x7e\u00a0-\u00ff]/g, ' ');
      for (let pos = 0; pos < Math.max(1, line.length); pos += 85) {
        if (y < 50) {
          page = pdf.addPage([595, 842]);
          y = 790;
        }
        page.drawText(line.slice(pos, pos + 85), { x: 40, y, size: 11, font });
        y -= 17;
      }
    }
    const user = env('RECEIPT_GMAIL_USER'),
      pass = env('RECEIPT_GMAIL_APP_PASSWORD').replace(/\s/g, '');
    if (!user || !pass) throw Error('Falta Gmail');
    const transport = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass },
      connectionTimeout: 10000,
      socketTimeout: 15000,
    });
    const sent = await transport.sendMail({
      from: { name: 'NutriGalletas', address: user },
      to: sale.correo_cliente,
      subject: 'Tu recibo NutriGalletas #' + sale.numero,
      text: content.text,
      html: content.html,
      attachments: [
        {
          filename: 'Recibo-NutriGalletas-' + sale.numero + '.pdf',
          content: Buffer.from(await pdf.save()),
          contentType: 'application/pdf',
        },
      ],
    });
    if (!sent.accepted?.length) throw Error('Correo rechazado');
    await rpc(adminId, 'web', 'envio_fin', {
      clave: key,
      estado: 'aceptado',
      proveedor_id: sent.messageId,
    });
    output.reply +=
      ' El servidor de correo aceptó el recibo para ' + sale.correo_cliente + '.';
  } catch (caught) {
    const e = caught instanceof Error ? caught : new Error('Error de correo');
    await rpc(adminId, 'web', 'envio_fin', {
      clave: key,
      estado: e.name === 'TimeoutError' ? 'incierto' : 'fallido',
      detalle: e.message,
    });
    output.reply +=
      ' La venta está guardada, pero no se pudo confirmar el envío del recibo. Revisa la venta antes de reenviar.';
  }
  return output;
}
async function incoming(p: any) {
  verifyProof(p, env('MAKE_WEBHOOK_SECRET'));
  const sender = phone(p.sender);
  if (!/^[1-9][0-9]{7,14}$/.test(sender)) throw Error('Acceso denegado');
  if (sender !== adminPhone) {
    const output =
      p.text === '__NUTRI_COMPROBANTE_IMAGEN__' && p.audioUrl
        ? await customerReceipt(p)
        : await publicBrain({
            sender,
            message:
              p.type === 'audio' ? String(p.transcript || '').slice(0, 2000) : p.text,
            eventId: p.eventId,
            audioError: p.audioError === true,
          });
    if (output.suppressed) return { ok: true, suppressed: true };
    const delivery = await sendWhatsApp(
      output.reply,
      'cliente-respuesta:' + sender + ':' + p.eventId,
      false,
      sender,
    );
    let qrDelivery;
    if (output.enviar_qr && delivery.accepted)
      qrDelivery = await sendWhatsApp(
        'NutriGalletas · Reserva ' +
          output.pedido.id +
          '\nImporte exacto: Bs ' +
          Number(output.pedido.total).toFixed(2) +
          '\nEl cliente debe introducir este importe en su banco. Envía el comprobante antes de ' +
          new Date(output.pedido.reserva_hasta).toLocaleTimeString('es-BO', {
            timeZone: 'America/La_Paz',
          }),
        'qr-pedido:' + output.pedido.id,
        false,
        sender,
        env('APP_ORIGIN') + '/src/assets/qr-ganadero.png',
      );
    return { reply: output.reply, delivery, qrDelivery };
  }
  if (p.text === '__NUTRI_COMPROBANTE_IMAGEN__')
    return {
      reply:
        'Los comprobantes de clientes se revisan desde Pedidos para recoger. Deben enviarse desde el número del cliente con una reserva vigente.',
      delivery: await sendWhatsApp(
        'Revisa los comprobantes desde Pedidos para recoger. El cliente debe enviar la imagen desde el número donde reservó.',
        'imagen-admin:' + p.eventId,
      ),
    };
  let output;
  if (p.audioError)
    output = {
      reply: 'El audio supera los 2 MB. Envía uno más corto o escribe tu consulta.',
    };
  else
    output = await brain({
      user: adminId,
      channel: 'whatsapp',
      message: p.type === 'audio' ? String(p.transcript || '').slice(0, 2000) : p.text,
      eventId: p.eventId,
    });
  output = await receiptAfterConfirmation(output);
  if (output.suppressed) return { ok: true, suppressed: true };
  const text =
    customerText(output.reply) +
    (output.pending
      ? `\n\nResponde CONFIRMAR${output.pending.qr ? ' QR VERIFICADO' : ''} para guardar o CANCELAR para descartar.\nReferencia: ${output.pending.id}`
      : '');
  const delivery = await sendWhatsApp(text, 'respuesta:' + p.eventId);
  // El mensaje real abre la ventana; despacha avisos vencidos sin exigir otro mensaje artificial.
  if (delivery.accepted) await dispatch({ includePdf: false }).catch(() => null);
  return { ...output, delivery };
}
async function customerReceipt(p: any) {
  const state = await publicRpc(p.sender, 'inicio', {
    evento: p.eventId,
    mensaje: '[Imagen de comprobante recibida]',
  });
  if (state.duplicado) return state.respuesta || { suppressed: true };
  if (state.limitado) return { suppressed: true };
  if (state.estado === 'humano') {
    await publicRpc(p.sender, 'finalizar', {
      evento: p.eventId,
      respuesta: '',
      contexto: state.contexto || {},
      silencio: true,
    });
    return { suppressed: true };
  }
  let order: any,
    reply,
    receiptPath: string | null = null;
  try {
    order = await ordersRpc(p.sender, 'actual');
    if (
      order.sin_pedido ||
      !['esperando_comprobante', 'pago_por_verificar'].includes(order.estado)
    )
      throw Error(
        'No hay una reserva vigente esperando comprobante. Si ya enviaste uno, espera la revisión del banco y no vuelvas a pagar.',
      );
    await ordersRpc(p.sender, 'comprobante_iniciar', { id: order.id });
    await publicRpc(p.sender, 'consumo');
    const image = await readReceiptImage({
      url: p.audioUrl,
      key: env('OPENAI_API_KEY'),
      model: env('OPENAI_MODEL') || 'gpt-5.4-mini',
      onDownloaded: async (file: any) => {
        receiptPath = order.id + '/' + crypto.randomUUID() + '.' + file.extension;
        const upload = await admin.storage
          .from('comprobantes-pedidos')
          .upload(receiptPath, file.bytes, { contentType: file.type, upsert: false });
        if (upload.error) {
          receiptPath = null;
          throw Error('No se pudo guardar el comprobante');
        }
      },
    });
    const result = await ordersRpc(p.sender, 'comprobante_guardar', {
      id: order.id,
      ruta: receiptPath,
      lectura: image.reading,
    });
    const matched =
      image.reading.importe === Number(order.total) &&
      image.reading.moneda === 'BOB' &&
      image.reading.legible &&
      image.reading.destino !== 'no_coincide';
    reply =
      '¡Gracias! Recibimos tu comprobante a tiempo y estamos verificando que el pago se haya realizado correctamente.\n\n' +
      (matched
        ? 'El importe leído coincide con el pedido.'
        : 'La lectura automática necesita revisión; un cajero o administrador comprobará los datos y el abono. No vuelvas a pagar.') +
      ' Conservamos tus productos reservados durante la revisión.\n\nTe avisaremos cuando el abono esté confirmado. Referencia: ' +
      result.id;
  } catch (e) {
    if (order?.id)
      await ordersRpc(p.sender, 'comprobante_error', {
        id: order.id,
        ruta: receiptPath,
      }).catch(() => null);
    reply =
      'Recibimos tu imagen y la lectura necesita revisión. Si llegó dentro del plazo, conservamos la reserva para que un cajero o administrador revise el abono. No pagues de nuevo. Puedes solicitar atención humana.';
  }
  await publicRpc(p.sender, 'finalizar', {
    evento: p.eventId,
    respuesta: reply,
    contexto: state.contexto || {},
    silencio: false,
  });
  return { reply };
}
async function orderSession(req: Request) {
  if (req.headers.get('origin') !== env('APP_ORIGIN')) throw Error('Acceso denegado');
  const token = req.headers.get('authorization')?.replace(/^Bearer /i, '') || '',
    verified = await admin.auth.getUser(token);
  if (verified.error || !verified.data.user) throw Error('Acceso denegado');
  const client = createClient(url, anon, {
      global: { headers: { Authorization: 'Bearer ' + token } },
      auth: { persistSession: false },
    }),
    role = await client.rpc('rol_actual');
  if (role.error || !['administrador', 'cajero'].includes(role.data))
    throw Error('Acceso denegado');
  return { id: verified.data.user.id, role: role.data };
}
async function orderWeb(req: Request, body: any) {
  const user = await orderSession(req),
    allowed = [
      'lista',
      'aprobar',
      'confirmar_pago',
      'listo',
      'entregar',
      'rechazar',
      'configurar',
      'archivo',
    ];
  const action = body.action || 'lista';
  if (!allowed.includes(action)) throw Error('Acción no permitida');
  const output = await ordersRpc('', action, body, user.id);
  if (action === 'archivo') {
    if (!output.ruta) return { error: 'No hay un comprobante disponible' };
    const link = await admin.storage
      .from('comprobantes-pedidos')
      .createSignedUrl(output.ruta, 120);
    if (link.error) throw Error('No se pudo abrir el comprobante');
    return { url: link.data.signedUrl };
  }
  const queue = await ordersRpc('', 'lista', {}, user.id);
  let notification;
  if (['aprobar', 'confirmar_pago', 'listo', 'entregar', 'rechazar'].includes(action)) {
    const order = queue.pedidos.find((o: any) => o.id === body.id);
    if (order) {
      const age = Date.now() - Date.parse(order.ultimo_entrante_cliente || '');
      if (Number.isFinite(age) && age >= 0 && age < 23.8 * 3600000) {
        const at = new Date(order.fecha_recogida).toLocaleString('es-BO', {
          timeZone: 'America/La_Paz',
        });
        const text =
          action === 'aprobar'
            ? 'Solicitud aprobada. Reservamos tus productos por 10 minutos.\n\nTotal: Bs ' +
              Number(order.total).toFixed(2) +
              '\nRecogida: ' +
              at +
              '\nLugar: ' +
              queue.configuracion.direccion +
              '\n' +
              (queue.configuracion.mapa_url || '') +
              '\n\nPaga y envía una imagen del comprobante antes de ' +
              new Date(order.reserva_hasta).toLocaleTimeString('es-BO', {
                timeZone: 'America/La_Paz',
              }) +
              '. Cuando la recibamos, conservaremos la reserva mientras verificamos el abono.'
            : action === 'confirmar_pago'
              ? 'Pago confirmado en el banco. Tu compra de Bs ' +
                Number(order.total).toFixed(2) +
                ' quedó registrada.\n\nRecogida en tienda: ' +
                at +
                '\nReferencia: ' +
                order.id
              : action === 'listo'
                ? 'Tu pedido está preparado para recoger en tienda.\n\nFecha y hora acordadas: ' +
                  at +
                  '\nReferencia: ' +
                  order.id
                : action === 'entregar'
                  ? 'Tu pedido fue marcado como entregado. Gracias por tu compra en NutriGalletas.\nReferencia: ' +
                    order.id
                  : 'La reserva se liberó tras revisar que no hubo abono. Si realizaste un pago, solicita atención humana y no pagues de nuevo.\nReferencia: ' +
                    order.id;
        notification = await sendWhatsApp(
          text,
          'estado-pedido:' + order.id + ':' + order.estado,
          false,
          order.telefono,
        ).catch(() => ({ needsReview: true }));
        if (
          action === 'aprobar' &&
          order.estado === 'esperando_comprobante' &&
          (notification?.accepted || notification?.duplicate)
        )
          notification.qr = await sendWhatsApp(
            'NutriGalletas · Total exacto: Bs ' +
              Number(order.total).toFixed(2) +
              '\nEnvía el comprobante dentro del plazo de 10 minutos.',
            'qr-pedido:' + order.id,
            false,
            order.telefono,
            env('APP_ORIGIN') + '/src/assets/qr-ganadero.png',
          ).catch(() => ({ needsReview: true }));
      } else notification = { outsideWindow: true };
    }
  }
  return { ok: true, ...queue, notification };
}
async function weeklyPdf(report: any, cutoff: Date) {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: any,
    y = 0;
  const start = () => {
    page = pdf.addPage([595, 842]);
    y = 790;
  };
  start();
  const write = (text: string, title = false) => {
    for (const paragraph of text
      .replace(/[^\x20-\x7e\u00a0-\u00ff\n]/g, ' ')
      .split('\n')) {
      let line = '';
      for (const word of paragraph.split(' ')) {
        const next = line ? line + ' ' + word : word;
        if (font.widthOfTextAtSize(next, 10) > 495 && line) {
          if (y < 55) start();
          page.drawText(line, { x: 50, y, size: 10, font, color: rgb(0.16, 0.2, 0.23) });
          y -= 16;
          line = word;
        } else line = next;
      }
      if (y < 55) start();
      page.drawText(line.replace(/[^\x20-\x7e\u00a0-\u00ff]/g, ' '), {
        x: 50,
        y,
        size: title ? 17 : 10,
        font: title ? bold : font,
      });
      y -= title ? 28 : 16;
    }
    y -= 10;
  };
  write('NutriGalletas | Reporte semanal', true);
  write(
    'Corte: ' +
      cutoff.toLocaleString('es-BO', { timeZone: 'America/La_Paz' }) +
      ' (Bolivia)',
  );
  for (const kind of [
    'finanzas',
    'ventas',
    'inventario',
    'vencimientos',
    'estancados',
    'margenes',
  ])
    write(formatReport(report, kind));
  write(
    'Datos internos. Incluye el domingo solo hasta las 20:00. Compras recibidas y gastos operativos se registran por separado.',
  );
  return Buffer.from(await pdf.save());
}
async function dispatch({ includePdf = true } = {}) {
  if (env('IA_AUTOMATIONS_ENABLED') !== 'true') return { paused: true };
  const now = new Date(),
    local = new Date(now.getTime() - 4 * 3600000),
    today = day(now),
    agenda = await rpc(adminId, 'web', 'agenda');
  const age = now.getTime() - Date.parse(agenda.ultimo_entrante || '');
  const within = Number.isFinite(age) && age >= 0 && age < 23.8 * 3600000;
  const report = await rpc(adminId, 'web', 'consulta', {
    desde: today,
    hasta: now.toISOString(),
  });
  const results: any[] = [];
  const notify = async (text: string, key: string) => {
    try {
      return await sendWhatsApp(text, key, !within);
    } catch {
      return { whatsappError: true, job: key };
    }
  };
  if (local.getUTCHours() >= 8) {
    const lows = report.inventario.filter((x: any) => x.reponer),
      soon = report.lotes.filter(
        (x: any) =>
          new Date(x.vence).getTime() - new Date(today).getTime() <= 15 * 86400000,
      );
    if (lows.length || soon.length)
      results.push(await notify(inventoryAlert(report, today), 'alerta:' + today));
  }
  const pickupQueue = await ordersRpc('', 'lista', {}, adminId).catch(() => ({
    pedidos: [],
  }));
  for (const order of pickupQueue.pedidos
    .filter((o: any) =>
      ['pendiente_aprobacion', 'pago_por_verificar', 'pagado', 'listo'].includes(
        o.estado,
      ),
    )
    .slice(0, 5)) {
    const at = new Date(order.fecha_recogida).toLocaleString('es-BO', {
      timeZone: 'America/La_Paz',
    });
    results.push(
      await notify(
        (order.estado === 'pendiente_aprobacion'
          ? 'Solicitud por aprobar'
          : order.estado === 'pago_por_verificar'
            ? 'Comprobante por verificar'
            : 'Pedido para preparar') +
          '\n\n' +
          order.nombre +
          ' recogerá el ' +
          at +
          '.\n' +
          order.items
            .map((i: any) => '• ' + i.nombre + ': ' + i.cantidad + ' paquetes')
            .join('\n') +
          '\n\nRevisa Pedidos para recoger. Referencia: ' +
          order.id,
        'pedido-aviso:' + order.id + ':' + order.estado,
      ),
    );
  }
  const customerQueue = await publicRpc('', 'lista').catch(() => ({ solicitudes: [] }));
  for (const request of customerQueue.solicitudes.slice(0, 3))
    results.push(
      await notify(
        'Nueva solicitud de WhatsApp\n\nTipo: ' +
          (request.tipo === 'humano' ? 'Atención humana' : 'Consulta de compra') +
          '\nReferencia: ' +
          request.id +
          '\n\nRevísala en Atención de WhatsApp del menú.',
        'atencion:' + request.id,
      ),
    );
  for (const reminder of agenda.recordatorios)
    results.push(
      await notify('Recordatorio: ' + reminder.texto, 'recordatorio:' + reminder.id),
    );
  if (
    local.getUTCHours() > 20 ||
    (local.getUTCHours() === 20 && local.getUTCMinutes() >= 15)
  )
    results.push(
      await notify(
        'Cierre diario NutriGalletas · corte 20:15\n\n' +
          briefFinance(
            await rpc(adminId, 'web', 'consulta', {
              desde: today,
              hasta: today + 'T20:15:00-04:00',
            }),
          ),
        'cierre:' + today,
      ),
    );
  if (includePdf && local.getUTCDay() === 0 && local.getUTCHours() >= 20) {
    const cutoff = new Date(today + 'T20:00:00-04:00'),
      monday = new Date(local);
    monday.setUTCDate(monday.getUTCDate() - 6);
    const range = {
        desde: monday.toISOString().slice(0, 10),
        hasta: cutoff.toISOString(),
      },
      weekly = await rpc(adminId, 'web', 'consulta', range),
      key = 'pdf:' + today;
    const reserved = await rpc(adminId, 'web', 'envio', {
      clave: key,
      tipo: 'pdf_semanal',
    });
    if (reserved.nuevo) {
      try {
        const profile = await admin
          .from('perfiles_usuarios')
          .select('email')
          .eq('id', adminId)
          .eq('rol', 'administrador')
          .eq('activo', true)
          .single();
        if (profile.error) throw Error('Administrador no disponible');
        const user = env('RECEIPT_GMAIL_USER'),
          pass = env('RECEIPT_GMAIL_APP_PASSWORD').replace(/\s/g, '');
        if (!user || !pass) throw Error('Falta configurar Gmail');
        const transport = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 465,
          secure: true,
          auth: { user, pass },
          connectionTimeout: 12000,
          socketTimeout: 20000,
        });
        const sent = await transport.sendMail({
          from: { name: 'NutriGalletas', address: user },
          to: profile.data.email,
          subject: 'NutriGalletas | Reporte semanal ' + today,
          text: 'Adjuntamos el reporte semanal. Corte: domingo 20:00, hora de Bolivia.',
          attachments: [
            {
              filename: 'NutriGalletas-semanal-' + today + '.pdf',
              content: await weeklyPdf(weekly, cutoff),
              contentType: 'application/pdf',
            },
          ],
        });
        if (!sent.accepted?.length) throw Error('Correo rechazado');
        await rpc(adminId, 'web', 'envio_fin', {
          clave: key,
          estado: 'aceptado',
          proveedor_id: sent.messageId,
        });
        results.push({ pdfAccepted: true });
      } catch (caught) {
        const e = caught instanceof Error ? caught : new Error('Error del servicio');
        await rpc(adminId, 'web', 'envio_fin', {
          clave: key,
          estado: e.name === 'TimeoutError' ? 'incierto' : 'fallido',
          detalle: e.message,
        });
        results.push({ pdfError: true });
      }
    }
  }
  return { ok: true, results };
}
Deno.serve(async (req) => {
  const path = new URL(req.url).pathname.split('/').at(-1);
  if (['webchat', 'orders'].includes(path || '') && req.method === 'OPTIONS') {
    if (req.headers.get('origin') !== env('APP_ORIGIN'))
      return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: cors });
  }
  try {
    if (req.method !== 'POST')
      return Response.json({ error: 'Método no permitido' }, { status: 405 });
    const raw = await req.text();
    if (raw.length > 60000)
      return Response.json({ error: 'Solicitud demasiado grande' }, { status: 413 });
    let output;
    if (path === 'orders') {
      output = await orderWeb(req, JSON.parse(raw));
    } else if (path === 'webchat') {
      const user = await webUser(req),
        body = JSON.parse(raw);
      if (
        ['estado_atencion', 'pausar_cliente', 'reanudar_cliente'].includes(body.action)
      ) {
        if (body.action !== 'estado_atencion' && phone(body.telefono) === adminPhone)
          throw Error('Acceso denegado');
        if (body.action !== 'estado_atencion')
          await publicRpc(
            phone(body.telefono),
            body.action === 'pausar_cliente' ? 'humano' : 'reanudar',
            {
              mensaje: 'Atención iniciada manualmente por el administrador desde la web.',
            },
          );
        const inbox = await admin.rpc('ia_bandeja_whatsapp');
        if (inbox.error) throw Error('No se pudo cargar Atención de WhatsApp.');
        output = inbox.data;
      } else if (body.action === 'revisar_solicitud') {
        await publicRpc(
          phone(body.telefono),
          body.action === 'reanudar_cliente' ? 'reanudar' : 'revisar',
          { id: body.id },
        );
        output = {
          reply:
            body.action === 'reanudar_cliente'
              ? 'Asistente reanudado para ese cliente.'
              : 'Solicitud marcada como revisada; no registra una venta ni aprueba un pago.',
          ...(await publicRpc('', 'lista')),
        };
      } else {
        output = await receiptAfterConfirmation(
          await brain({
            user,
            channel: 'web',
            message: body.message || '',
            eventId: body.eventId || crypto.randomUUID(),
            action: body.action,
            id: body.id,
            verified: body.verified === true,
          }),
        );
      }
    } else {
      makeAccess(req);
      if (path === 'preflight') output = await preflight(raw, req);
      else if (path === 'message') output = await incoming(JSON.parse(raw));
      else if (path === 'dispatch') output = await dispatch();
      else return Response.json({ error: 'Ruta inexistente' }, { status: 404 });
    }
    return Response.json(output, {
      headers: ['webchat', 'orders'].includes(path || '')
        ? cors
        : { 'Cache-Control': 'no-store' },
    });
  } catch (caught) {
    const e = caught instanceof Error ? caught : new Error('Error del servicio');
    const denied = e.message === 'Acceso denegado';
    return Response.json(
      {
        error: denied
          ? e.message
          : 'No se pudo completar la operación. ' +
            (path === 'orders' || e.message?.includes('006')
              ? e.message
              : 'Revisa la conexión o vuelve a intentarlo.'),
      },
      {
        status: denied ? 403 : 400,
        headers: ['webchat', 'orders'].includes(path || '')
          ? cors
          : { 'Cache-Control': 'no-store' },
      },
    );
  }
});
