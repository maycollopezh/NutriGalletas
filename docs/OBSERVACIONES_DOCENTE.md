# Observaciones de la docente — NutriGalletas

## Funciones y criterio aplicado

- **Lotes:** catálogo consultable por lote, cantidades recibidas/disponibles/salidas y vencimiento. La venta asigna lotes automáticamente por FEFO (primero vence, primero sale); la selección manual de un lote vencido no se permite. El recibo muestra cada lote utilizado.
- **Demanda diaria:** promedio de paquetes vendidos durante los últimos N días calendario completos, incluyendo los días sin ventas y excluyendo hoy. Para EOQ se anualiza multiplicando por 365. El promedio se actualiza al consultar la base; no necesita un proceso nocturno.
- **Mínimo automático de reposición:** techo(demanda diaria × plazo de entrega + reserva). Es el **punto de pedido**, distinto de la reserva de seguridad. Se muestra por producto y se utiliza en las alertas. Los paquetes en camino intervienen en la decisión de volver a pedir, no en el stock vendible.
- **Fuente de demanda:** la migración activa el historial registrado para los parámetros existentes. Un administrador puede elegir una estimación explícita si no existe un historial representativo. No se inventa una demanda cuando el historial no tiene ventas. En tal caso el mínimo aparece sin estimación. Los días de cierre también cuentan; un cierre prolongado o un quiebre de stock requiere revisar el promedio.
- **Parámetros económicos:** se conservan EOQ, reserva estadística opcional, cobertura en días y límites por vida útil/capacidad. El sistema no estima costos de mantenimiento ni plazos sin datos: el administrador debe configurarlos.
- **Compatibilidad:** `productos.stock_minimo` se conserva para datos anteriores, pero deja de ser un campo editable y **no es la fuente de las alertas**. El mínimo vigente se obtiene de `consultar_resumen_inventario()`, para evitar valores guardados que se desactualicen con el cambio de fecha. El modelo vigente sigue estando en `parametros_inventario`.
- **Efectivo y vuelto:** importe recibido obligatorio; no puede ser menor que el total y admite hasta dos decimales. El cambio se calcula en la transacción de la base de datos. Las ventas antiguas sin importe recibido muestran «No registrado».
- **Reintentos:** la solicitud de venta tiene una clave de idempotencia. Repetir la misma solicitud no duplica venta ni descuentos. Reutilizar una clave con otros datos se rechaza.
- **Usuarios y permisos:** se mantienen tres perfiles. Administrador gestiona usuarios/planificación; cajero registra y consulta sus ventas; almacén gestiona recepción y consulta inventario/planificación. Cajero obtiene códigos y cantidades de lotes sin acceder a costos ni proveedores. Acceso anónimo y sesiones no autorizadas se rechazan en SQL.
- **Recibo por correo:** el cliente puede dar un correo opcional. Tras registrar la venta se solicita el envío de un recibo HTML y PDF. También puede reenviarse desde el comprobante. La función verifica sesión, rol y propiedad de la venta; arma los importes desde los datos guardados y limita reenvíos. Un error de correo nunca revierte ni duplica una venta.
- **QR:** imagen original reemplazada por la nueva proporcionada. Sigue siendo QR fijo con monto ingresado por el cliente y comprobación manual del cajero.

## Activar en Supabase

1. Ejecutar `supabase/004_observaciones_docente.sql` después de las migraciones 001 y 003. No ejecutar 001/002 de nuevo en el proyecto existente.
2. Desplegar la función `receipt-email` con sus archivos `index.ts` y `handler.ts`. Mantener la verificación JWT de plataforma activada. Además, la función verifica explícitamente el JWT, el perfil y la sesión autorizada.
3. Mantener `APP_ORIGIN` con el origen exacto del sistema (por ejemplo `http://127.0.0.1:4317` durante desarrollo).
4. Configurar los secretos `RECEIPT_GMAIL_USER` y `RECEIPT_GMAIL_APP_PASSWORD` directamente en Supabase. Esta última es una contraseña de aplicación de Google, no la contraseña habitual. No ponerla en el código, capturas ni chat. Google puede exigir verificación en dos pasos y no todas las cuentas ofrecen contraseñas de aplicación.
5. Iniciar sesión, crear una venta de prueba y, con autorización del destinatario, enviar un recibo. Comprobar bandeja de entrada/spam y el PDF. SMTP aceptado significa que el proveedor aceptó el mensaje; no prueba por sí solo la entrega en la bandeja.

El envío Gmail es apropiado para la demostración de bajo volumen y depende de las restricciones de Google. No utiliza la API de recuperación de contraseñas de Supabase ni modifica el hook de Resend existente.

## Entorno y comprobaciones

Los tests de JavaScript y PostgreSQL local prueban lógica y permisos; no sustituyen la comprobación sobre el proyecto real de Supabase. Cualquier activación externa o envío real pendiente debe informarse explícitamente al entregar el avance.
