# Asistente NutriGalletas: implementación y activación

## Estado de esta entrega

La migración 006 está aplicada en Supabase y `nutri-ai` está desplegada con las verificaciones propias autorizadas. La web está publicada en https://nutrigalletas-lp.netlify.app/ y OpenAI está conectado. Antes de que el propietario asumiera las pruebas se verificaron consultas de finanzas e inventario; no se confirmaron operaciones comerciales. Desde su indicación de no hacer pruebas, solo se trabaja en configuración y publicación.

Make: escenario **NutriGalletas | Asistente IA | Texto y audio**, ID 6952510. Se importó el flujo adaptado con rutas exclusivas de NutriGalletas, webhook propio, recepción inmediata y límite de seis inicios por minuto. Permanece inactivo hasta completar la credencial exclusiva y YCloud. Don Juan no se modifica.

El propietario conectó **+59162502582** como **NutriGalletas** en el portafolio **BenforMarket-MKT** (Meta business 994888656465436, activo 1409925087792062). Meta muestra Conectado. Esto sustituye el número inicialmente propuesto; todavía hay que actualizar YCLOUD_BUSINESS_PHONE y verificar su aparición en la cuenta de YCloud adecuada. La sesión YCloud consultada solo muestra Don Juan. Las banderas de WhatsApp y automatizaciones permanecen desactivadas hasta completar conexiones.

## Acceso y reglas

- Web: administrador activo con JWT verificado por Supabase Auth y sesión autorizada por `rol_actual()`. Además se vincula al administrador propietario configurado; cajero y almacén no tienen chat.
- WhatsApp: solamente el número administrador hacia el número del negocio configurados en Supabase. Otros remitentes/destinos se ignoran antes de consultar datos o usar OpenAI.
- Make: `X-Make-Secret` propio y firma HMAC de YCloud sobre el cuerpo crudo. Tolerancia 5 minutos. La prueba de preflight caduca a los 10 minutos y vincula remitente, evento, texto y audio.
- Audio: Make conserva la descarga y transcripción existente; máximo 2 MB, hosts HTTPS permitidos. No permitir redirecciones hacia hosts no autorizados. No activar audio hasta comprobar esa restricción en el módulo HTTP de Make.
- Cada operación necesita resumen y confirmación explícita. «Sí» interpretado por el modelo no ejecuta operaciones. En WhatsApp: `CONFIRMAR <id>` o `CANCELAR <id>`; para QR añadir `QR VERIFICADO` después de comprobar el banco.
- Se reutilizan `registrar_venta_cobro` y `registrar_compra`. La RPC IA solamente admite `service_role`; la identidad administrativa se valida nuevamente en SQL. Su contexto de sesión es temporal a la transacción y se retira antes de retornar. Las sesiones normales y sus permisos no se cambian.
- Confirmaciones de 10 minutos, por usuario/canal y con bloqueo de fila. Un segundo intento devuelve el resultado previo. Precios y stock se verifican nuevamente. Compras son mercadería recibida; no se envían pedidos a proveedores.
- Costos históricos por lote; FEFO; vuelto en SQL; QR con comprobación manual del abono.

## Funciones

Consultas de finanzas, comparación de períodos, productos más vendidos, productos sin venta por 30 días, márgenes sobre ingresos, inventario, demanda diaria, mínimo de reposición, cobertura y EOQ teórico. Los totales se agregan en PostgreSQL sobre el período completo. La IA interpreta la intención: no escribe SQL ni inventa importes.

`resultado_neto_estimado = ingresos - costo histórico vendido - gastos registrados`. No es una declaración fiscal. Las compras no se descuentan otra vez como gasto. Margen sobre ingresos y recargo sobre costo son distintos. El margen objetivo no se fija en 33% sin decisión del negocio.

EOQ es una referencia teórica; revisar capacidad y vencimiento antes de comprar. Cobertura es una estimación basada en demanda anterior; no una promesa de fecha de desabastecimiento. Si no hay demanda no se inventa una predicción.

Se preparan ventas, compras, gastos y recordatorios. Si una venta confirmada incluye correo del cliente, su recibo usa el mismo formateador del sistema, un PDF y Gmail; la confirmación muestra previamente el destinatario. Se solicitan datos faltantes y nombres ambiguos. Contexto: últimos 6 mensajes, útil por 30 minutos. El botón de atención humana pausa ambos canales; reanudar requiere acción en la web. Atender personalmente en YCloud Inbox mientras esté pausado.

## Secretos de Supabase (nunca dentro de src, Git o el chat)

Guardar en Edge Functions > Secrets del proyecto **jdfemijbeqxwcilyhxxv**:

| Nombre | Valor/configuración |
|---|---|
| OPENAI_API_KEY | Clave creada por el propietario en su proyecto OpenAI |
| OPENAI_MODEL | Modelo habilitado; implementación inicial configurable `gpt-5.4-mini` |
| MAKE_WEBHOOK_SECRET | Secreto aleatorio propio, igual en los HTTP de Make |
| YCLOUD_API_KEY | Clave propia de YCloud con envío habilitado |
| YCLOUD_SIGNING_SECRET | Secreto del nuevo webhook de NutriGalletas, no el de Don Juan |
| YCLOUD_ALERT_TEMPLATE | Nombre de plantilla aprobada en español, cuerpo con una variable de texto |
| IA_ADMIN_WHATSAPP | Número autorizado del administrador con prefijo 591, solo dígitos |
| YCLOUD_BUSINESS_PHONE | Número del asistente con prefijo 591, solo dígitos |
| IA_ADMIN_USER_ID | 59d0d5e2-fff9-446a-aecc-3152efc4fe5d |
| IA_WHATSAPP_ENABLED | `false` hasta verificar número, firmas, destinatario y prueba real; luego `true` |
| IA_AUTOMATIONS_ENABLED | `false` hasta comprobar cron, PDF y destinatario; luego `true` |

Ya se usan APP_ORIGIN y los dos secretos RECEIPT_GMAIL_USER / RECEIPT_GMAIL_APP_PASSWORD. No sustituirlos ni copiar secretos de otro proyecto. Las contraseñas personales no se cambian.

Responses usa herramientas de esquema estricto y `store:false`; se envían el mensaje, contexto corto y catálogo autorizado, sin claves ni contraseñas. Se limita a 300 interpretaciones/mes y 6 solicitudes/minuto. Son límites de solicitudes, no una garantía de gasto en dólares; vigilar saldo OpenAI y créditos de Make/YCloud. Las alertas y el PDF se calculan sin consumir OpenAI.

## Instalación

1. Aplicar `supabase/006_asistente_ia.sql` después de 001, 003 y 004. No volver a cargar 002_seed en la nube. La migración es repetible y conserva datos.
2. Desplegar `supabase/functions/nutri-ai/` con su configuración. El punto de entrada mixto tiene `verify_jwt=false` porque recibe webhooks; cada ruta verifica su autenticación propia. No cambiar receipt-email ni desactivar su JWT.
3. Si se usa el editor del dashboard, generar archivo único con `node scripts/build-ai-function.mjs`; pegar `/tmp/nutrigalletas-ai/index.ts`. El generador no incluye valores secretos.
4. Adaptar la copia de Make: todos los HTTP al proyecto NutriGalletas, `nutri-ai/preflight` y `nutri-ai/message`; reemplazar Authorization de proyecto y X-Make-Secret. Preflight debe recibir cuerpo JSON CRUDO y YCloud-Signature. Mantener las expresiones y filtros de tipo de mensaje, revisar audio 2 MB/redirecciones. La salida preflight conserva sender/eventId/type/at/text/audioUrl/proof.
5. Configurar nuevo endpoint YCloud al webhook NUEVO de Make con encabezados y JSON pass-through. Nunca redirigir el endpoint de Don Juan.
6. Probar texto, audio, remitente no autorizado, repetición, confirmación, cancelación y caducidad antes de activar escenario.
7. Crear escenario separado de Make, cada 15 minutos (mínimo mostrado por el plan actual de Make): POST `https://jdfemijbeqxwcilyhxxv.supabase.co/functions/v1/nutri-ai/dispatch` con X-Make-Secret y cuerpo `{}`. No usa OpenAI. La hora se evalúa en Bolivia en el servidor.
8. Alertas desde 08:00, una por día si hay bajo stock o vencimientos. Recordatorios cuando vencen. Fuera de la ventana de conversación de 24h necesita plantilla aprobada; no simular envío libre.
9. PDF semanal: domingo 20:00 Bolivia; período lunes 00:00 a domingo 20:00. Envío únicamente al correo del administrador activo. Si la tienda vende después, esas operaciones no forman parte de ese corte.
10. `npm test`, pruebas SQL y `npm run build`; publicar archivos web mediante el repositorio/Netlify habitual. Verificar la sesión real después del despliegue.

## Tablas privadas nuevas

`ia_conversaciones`, `ia_operaciones`, `ia_recordatorios`, `ia_eventos`, `ia_envios`, `ia_consumo`. No son nuevas tablas madre del negocio: guardan contexto, confirmaciones, deduplicación y auditoría. Clientes anon/authenticated no pueden leerlas ni ejecutar `ia_servicio`.

`gastos.registrado_en` permite respetar el corte temporal para gastos nuevos. Los registros antiguos conservan NULL porque su hora original no se conoce; se incluyen por su fecha y no se inventa una hora.

## Correo y entrega

El PDF se construye con pdf-lib y se envía por el SMTP Gmail ya configurado, dentro de Supabase. No contiene secretos. La aceptación SMTP/YCloud se registra como **aceptado**, no como entrega confirmada. Un timeout queda **incierto** y no se reintenta automáticamente para evitar duplicados; revisar los registros del proveedor antes de cualquier reenvío. Las reservas fallidas requieren revisión, no un bucle de reenvíos.

## Pruebas locales

`npm test`

`PGLITE_MODULE_PATH=/tmp/nutri-db/node_modules/@electric-sql/pglite/dist/index.js node tests/assistant-sql.mjs`

Si la dependencia está instalada en el proyecto, basta `node tests/assistant-sql.mjs`. Son bases efímeras, no modifican la nube.

Documentación: https://developers.openai.com/api/docs/guides/function-calling ; https://developers.openai.com/api/docs/models/gpt-5.4-mini ; https://ycloud.readme.io/reference/configure-webhooks ; https://docs.ycloud.com/reference/whatsapp_message-send-directly .
