# Asistente NutriGalletas: implementación y activación

## Estado de esta entrega

La migración 006 está aplicada en Supabase y `nutri-ai` está desplegada con las verificaciones propias autorizadas. La web está publicada en https://nutrigalletas-lp.netlify.app/ y OpenAI está conectado. Las consultas iniciales de finanzas e inventario se comprobaron antes de la instrucción del propietario de asumir las pruebas. Desde esa instrucción no se ejecutaron pruebas, Run once ni mensajes de prueba.

Configuración guardada y activada el 9 de noviembre de 2026:

- WhatsApp NutriGalletas: **+59162502582**, conectado en YCloud del perfil Personal, WABA **4613063352282906**, portafolio BenforMarket-MKT. Administrador autorizado: **+59168258788**.
- Webhook YCloud **6af143ca52123331d7183a16**, estado **Active**, solo `whatsapp.inbound_message.received`, hacia el webhook exclusivo de Make.
- Make **NutriGalletas | Asistente IA | Texto y audio**, ID **6952510**, estado **Active**, recepción inmediata, máximo seis inicios por minuto. Sus HTTP de Supabase usan la conexión exclusiva «NutriGalletas - Supabase protegido», restringida al origen del proyecto. El escenario Don Juan se conserva.
- Make **NutriGalletas | Alertas y PDF semanal**, ID **6956038**, estado **Active**, cada 15 minutos en America/La_Paz, POST `nutri-ai/dispatch`. No se verificó entrega de reportes.
- Supabase: MAKE_WEBHOOK_SECRET, YCLOUD_API_KEY y YCLOUD_SIGNING_SECRET guardados por el propietario. IA_WHATSAPP_ENABLED y IA_AUTOMATIONS_ENABLED activados. YCLOUD_ALERT_TEMPLATE = nutrigalletas_aviso_administrador.
- Plantilla `nutrigalletas_aviso_administrador`, español, Utility, enviada correctamente; estado observado **In review**. Un solo parámetro y muestra ficticia.

**Pendiente externo:** aprobación de la plantilla por Meta. YCLOUD_TEMPLATE_APPROVED permanece en false. Una vez que YCloud muestre la plantilla aprobada, guardar YCLOUD_TEMPLATE_APPROVED=true en Supabase. Mientras sea false, los avisos fuera de la ventana de conversación devuelven `pendingTemplate` antes de reservar un envío: no se marcan como enviados ni fallidos. Las respuestas a mensajes del administrador y el PDF por correo no dependen de esta bandera. La operación completa aún debe ser probada por el propietario.

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
| YCLOUD_ALERT_TEMPLATE | nutrigalletas_aviso_administrador, español, cuerpo con una variable de texto |
| YCLOUD_TEMPLATE_APPROVED | false mientras Meta revisa; true únicamente después de observar Approved |
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


## Incidencia de recepción: 9 de noviembre de 2026

El mensaje real del propietario llegó a Make (ejecución b6fa926e62034502aea9fced643e3c6d), pero preflight devolvió HTTP 400 y Make desactivó el escenario. Se encontró `Buffer` sin importar en security.mjs: el bundle mantenía una referencia global `Buffer`, mientras que el import del punto de entrada estaba renombrado a `Buffer2`. Se añadió el import explícito node:buffer y la comparación constante ahora verifica las longitudes de bytes. La función corregida fue desplegada en Supabase; no se ejecutaron pruebas.

El HTTP preflight conserva autenticación, firma y filtros de tipo, pero Return error if HTTP request fails se cambió a No: un rechazo no debe desactivar el canal. La respuesta de error no tiene type=text/audio y no pasa el router. El cambio quedó guardado en Make. La reactivación está pendiente de resolver un mensaje en cola; no se borró ni reprocesó. La revisión automática bloqueó Process old data por la instrucción previa de no enviar mensajes. Se pidió autorización específica para procesar el mensaje real.


## Ampliación conversacional — 15/11/2026

Se compararon el texto facilitado por el propietario, `_language.mjs`, `_brain.mjs` y `_ycloud.mjs` de Panadería Don Juan con la implementación de NutriGalletas. La panadería permanece sin modificaciones. Sus tiendas, pedidos, recetas, producción, entregas y deudas no se incorporan a NutriGalletas: el alcance sigue siendo una tienda de galletas terminadas.

- Prompt compartido explícito para conversación libre, saludos, explicaciones, reglas de inventario, seguimiento por producto y período, normalización y distinción entre pregunta y orden.
- Esquema de interpretación ampliado con respuesta, aclaración, productos y varios temas. Para consultas, PostgreSQL conserva los agregados; una segunda llamada a OpenAI redacta sobre datos autorizados y cálculos del servidor. Si la redacción falla, se devuelve el reporte calculado. Cada llamada cuenta en el límite mensual de 300, por lo que una consulta redactada puede consumir dos solicitudes.
- Las aclaraciones conservan una solicitud estructurada en el historial privado ya existente. Se renueva al continuar y se descarta al cambiar de tema; no requiere tablas ni permisos nuevos. Contexto temporal de seis mensajes y treinta minutos.
- Consultas enfocadas por producto y varios temas; gastos generales no se asignan arbitrariamente a un producto ni se atribuye el neto de todo el negocio a una galleta.
- WhatsApp acepta CONFIRMAR/CONFIRMO o CANCELAR/DESCARTAR para la única propuesta vigente del canal; conserva comandos con referencia. QR requiere CONFIRMAR QR VERIFICADO y validación SQL. Los eventos se reservan antes de resolver la propuesta, para que repetir un mensaje anterior no confirme una propuesta nueva.
- Archivos no compatibles reciben una petición de texto/audio; no se afirma haber visto fotos, documentos o stickers. Audio conserva el flujo Make y máximo 2 MB.
- Cada respuesta aceptada a un mensaje real revisa avisos vencidos mediante el despachador, sin emitir otra llamada de OpenAI para redactarlos. La agenda conserva sus claves únicas de envío. El PDF permanece en la agenda, no se genera dentro de una respuesta para evitar retrasarla.
- Alertas desde 08:00; cierre diario nuevo con corte fijo 20:15; PDF dominical conserva 20:00. Un cierre posterior al corte no incluye ventas posteriores. No se añadieron preparación de producción ni entregas de panadería.
- Ventana de texto: hasta 23,8 h desde el último entrante, con margen respecto de 24 h. Un saludo o consulta diaria del administrador la abre; una respuesta del bot no la extiende. Al cerrarse, no se fuerzan envíos libres.

YCloud observado el 15/11: NutriGalletas +59162502582 conectado, calidad High. Plantilla nutrigalletas_aviso_administrador Spanish **Active-Quality pending**, categoría **Marketing** (Meta cambió la categoría). La última configuración documentada de YCLOUD_TEMPLATE_APPROVED es false; en esta actualización no se habilitó envío de plantillas Marketing fuera de ventana. No se cambió esa bandera ni se verificó su valor actual leyendo secretos. Dentro de ventana se usa texto. Esto es una elección de envío, no un fallo de aprobación.

No se ejecutaron pruebas del sistema, llamadas de prueba a OpenAI, Run once ni mensajes de prueba. El propietario hará la validación funcional final. La preparación del bundle y el guardado/despliegue no equivalen a demostrar recepción de mensajes.


### Conexiones y agenda — actualización 15/11/2026

El cerebro conversacional actualizado se desplegó en Supabase y se publicó en GitHub (f6c69b7). El chat de NutriGalletas se observó Active; Make ya tenía ejecuciones históricas del 9/11. Los módulos de texto y audio ahora esperan 120 segundos y conservan las respuestas HTTP de error sin desactivar automáticamente el escenario; los detalles siguen disponibles en la ejecución. La agenda espera 180 segundos.

Se encontró la agenda 6956038 Inactive después de Forbidden. Make impidió activarla por el límite de dos escenarios activos. El propietario autorizó desactivar Don Juan, que ya no utiliza, para dedicar los dos espacios a NutriGalletas. No se aplicó ninguna migración Cron ni se creó otra clave; se conserva la agenda en Make. La desactivación no elimina código, conexiones ni datos de Panadería Don Juan. Las pruebas quedan a cargo del propietario.


**Resultado observado en Make el 15/11:** Don Juan 6794424 Inactive; NutriGalletas chat 6952510 Active; NutriGalletas agenda 6956038 Active, Every 15 minutes. La activación se logró después de desactivar Don Juan, por instrucción explícita del propietario. No se usaron Run once ni reejecuciones. La función conversacional se desplegó y el código web/documentación quedaron publicados en el repositorio; no se comprobó un envío ni se ejecutó una conversación de prueba. Los registros históricos de éxito en Make no acreditan por sí solos entrega de la versión actual.


## Atención pública y mensajes legibles — 15/11/2026

El propietario observó en WhatsApp dos problemas reales: respuestas con metainstrucciones («Saludo breve», «El usuario pregunta…») y un aviso que incluía todo el inventario. También solicitó atender números distintos al administrador, siguiendo la referencia de Don Juan y adaptando el alcance a NutriGalletas.

### Conversación y presentación

Se separó la redacción final de la extracción de intención: respuestas y aclaraciones tienen descripción explícita de texto dirigido al destinatario, se filtran metainstrucciones y las conversaciones administrativas se redactan en una segunda etapa. Saludos y ayuda básica tienen respuestas naturales seguras sin consumir OpenAI. Los reportes piden título, espacios, viñetas, máximo 150 palabras salvo detalle, y evitan calificar el desempeño sin meta o comparación. Hay presentación breve calculada incluso si falla la redacción.

El aviso diario incluye solo productos por reponer, lotes vencidos y vencimientos en 15 días; máximo cinco entradas por sección y referencia a la web para ampliar. No repite todos los productos, EOQ, cobertura y demanda en cada aviso. Esos cálculos siguen disponibles al consultarlos y en el PDF. La llegada de un aviso después de saludar responde al despacho de pendientes dentro de la ventana, no a una venta ni a un error de saldo.

### Dos ámbitos separados

- Administrador: conserva sus consultas financieras, inventarios, EOQ/FEFO, confirmaciones y reglas. El chat web sigue reservado al administrador propietario.
- Otros números de WhatsApp: catálogo activo de productos, presentación, categoría y precio; conversación y seguimiento de sus propias solicitudes; petición de atención humana. El servidor no les suministra costos, ganancias, proveedores, cifras de stock ni lotes. No se confía en una afirmación del mensaje para elevar permisos.
- Las solicitudes de compra requieren productos, cantidades y nombre. El servidor resuelve productos y calcula precios; CONFIRMAR envía una solicitud para revisión, CANCELAR descarta. El precio se vuelve a comprobar en SQL y la propuesta vence en diez minutos. Máximo quince líneas. No se crea una venta, no se reserva stock, no se registra un pago y no se promete reparto, horario o disponibilidad.
- Reclamos, cambios, cancelaciones de compras previas y solicitud de una persona pasan a atención humana por ese número. No se alteran ventas históricas. La conversación queda pausada hasta reanudarla desde la web.

### Base y web

Migración incremental 007_atencion_publica_whatsapp.sql: private.ia_clientes_whatsapp y private.ia_solicitudes_clientes, RLS sin acceso anon/authenticated, RPC ia_atencion_publica solo service_role. No se amplían los permisos de las tablas administrativas. Firma YCloud y prueba Make siguen validándose antes de aceptar cualquier remitente; se valida destino del negocio y formato internacional del remitente. El contenido del modelo nunca decide identidad o permisos.

Historial y propuesta públicos se separan por teléfono; contexto seis mensajes/treinta minutos, borradores diez minutos. Se deduplican eventos antes de confirmar, límite seis entrantes por minuto por remitente; interpretaciones públicas comparten el límite mensual existente de 300 solicitudes OpenAI con administración.

En Asistente IA se añade «Atención de WhatsApp»: solicitudes pendientes, mensajes de atención humana, enlace a YCloud para responder, marcar revisada y cerrar atención/reanudar IA por número. Marcar revisada no aprueba una compra ni acredita entrega. Las notificaciones de solicitudes llegan solo al administrador, dentro de su ventana abierta.

**Plantillas pagadas deshabilitadas por instrucción expresa:** sendWhatsApp retorna outsideWindow antes de reservar o enviar cualquier plantilla. La aceptación de la plantilla por Meta o la bandera de entorno ya no basta para emitirla. No se eliminó la plantilla de YCloud; simplemente no se utiliza. El PDF por correo sigue independiente. Respuestas a clientes solo se producen por su mensaje entrante; el despachador no les envía promociones ni avisos automáticos.

No se realizaron conversaciones, pruebas funcionales, envíos de prueba ni Run once. La validación del sistema la hará el propietario.
