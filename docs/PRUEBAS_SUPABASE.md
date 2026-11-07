# Pruebas de Supabase - 19 de octubre de 2026

Proyecto NutriGalletas: jdfemijbeqxwcilyhxxv. Entorno academico con datos ficticios. Pagina local conectada a Supabase real.

## Resultados verificados

- Cuenta administrador: inicio de sesion efectuado por el titular, perfil activo y datos cargados desde Supabase.
- Cuatro cuentas activas: Maycol administrador; Nancy y Jhissel cajero; Isaura almacen. Verificado en la pantalla conectada.
- Venta #0022: un paquete de Avena y miel por Bs 6,00, comprobante interno visible y saldo del lote 12 a 11.
- Compra: cinco paquetes a Bs 3,50, total Bs 17,50. Lote PRUEBA-SUPABASE-20261019, vencimiento 31/12/2026. Stock agregado de Avena y miel: 11 a 16. Desaparece la alerta de minimo.
- Panel tras esas operaciones, del 13 al 19 de octubre: ingresos Bs 191,00; costo vendido Bs 111,20; gastos Bs 37,00; resultado neto Bs 42,80. Valores previos a la prueba de concurrencia de Bs 0,01.
- Consulta directa posterior: 22 ventas guardadas; cero diferencias entre saldos y movimientos; cero diferencias de total/costo frente a detalles de ventas; cero unidades vendidas de lotes vencidos a la fecha de venta.
- API publica: HTTP 401 para productos y para crear usuarios sin sesion. RLS activo en 15 tablas entre public/private.
- tests/cloud-role-checks.sql: ejecutado en Supabase, 29 de 29 comprobaciones correctas. Resultado completo verificado en CSV exportado del SQL Editor. Prueba de las politicas reales con identidades y sesiones simuladas dentro de una transaccion revertida; no sustituye el inicio de sesion de cada empleado.
- tests/cloud-inactive-checks.sql: tres comprobaciones correctas de usuario temporalmente inactivo: no obtiene rol, no consulta productos y no registra ventas. Contexto simulado en SQL. La transaccion se revierte y Nancy queda activa.
- qa-supabase.html: dos llamadas simultaneas reales a registrar_venta con una unica unidad disponible. Una venta aprobada y otra rechazada por stock insuficiente. Saldo final 0; una unidad vendida. Ambos clientes usan la sesion real del administrador.
- Lote duplicado rechazado por unicidad; una sola compra y detalle, sin registro residual del intento duplicado.
- Endpoint real de acceso, correo ficticio exclusivo: [401,401,401,401,401,429]. Bloqueo comprobado tras cinco fallos; no se bloquearon las cuentas del equipo. El contador ficticio queda sujeto a su expiracion normal.
- Realtime: primer intento fallido por autorizacion de suscripcion. Con autenticacion explicita de la sesion existente y confirmacion system/status=ok, B recibe el cambio guardado por A. Verificado en qa-realtime.html, entre dos conexiones del administrador.
- Correccion aplicada en src/supabase.js: autenticar Realtime antes de suscribir; evitar suscripciones pendientes tras cierre. src/app.js espera el arranque. Se mantiene actualizacion periodica de 15 segundos.

## Registros de prueba conservados

La venta #0022 y compra de cinco paquetes permanecen en los datos ficticios. Para concurrencia se creo el producto exclusivo QA-1792464556087, con una compra y una venta por Bs 0,01; el producto fue desactivado al terminar. La comprobacion aislada de Realtime solo cambia la presentacion de ese producto ya desactivado. No se borraron registros ni se reinicio la base.

## Pendiente

1. Inicio de sesion real de las cuatro cuentas completado. Separacion de ventas entre Nancy y Jhissel comprobada desde sus interfaces.
2. Rechazo del inicio de sesion de un empleado inactivo con su contrasena real; la proteccion en base de datos ya fue comprobada.
3. Cierre/revocacion de sesiones y finalizacion de recuperacion: falta que el titular abra el correo, cambie su contrasena e inicie sesion nuevamente.
4. Correo del administrador activado y entregado con Resend el 20/10/2026. Pendiente: cambio real de contrasena por el titular, uso unico/vencimiento del enlace y entrega a empleados con remitente verificado. No se enviaron correos a los companeros.
5. Exportacion PDF completada: comprobante #0025 guardado desde Chrome en una pagina; contenido y render verificados, sin menus ni encabezado/pie del navegador.

## Evidencia y reproduccion

Bateria SQL: tests/cloud-role-checks.sql y tests/cloud-inactive-checks.sql. No ejecutar parcialmente ni retirar el ROLLBACK final. Las paginas qa-supabase.html y qa-realtime.html son herramientas locales de prueba, excluidas de dist/ por el proceso de build; no forman parte del menu del sistema. No contienen secretos. No volver a ejecutar la bateria completa de concurrencia sin necesidad: crea nuevos registros ficticios.

Referencias para el ajuste de Realtime:
- https://supabase.com/docs/reference/javascript/setauth
- https://supabase.com/docs/guides/troubleshooting/realtime-postgres-changes-troubleshooting

## Cuenta de Nancy: prueba real desde la interfaz

Inicio de sesion realizado por el titular. Perfil Rebeca Nancy Yana Corina, rol Cajero, conexion Supabase visible. Menu limitado a Ventas, Productos y Avance del proyecto; sin compras, gastos, inventario de costos ni usuarios. Catalogo de solo consulta, con precio de venta y stock disponible, sin controles de edicion ni costos de compra.

Antes de vender, el historial de Nancy tenia cero registros aunque ya existian ventas del administrador. Se registro desde su interfaz la venta #0024: una Avena y miel por Bs 6,00 en efectivo. Comprobante interno con su nombre correcto. Historial posterior: exactamente un registro propio, sin las ventas previas de otros usuarios. Stock vendible de Avena y miel disminuyo de 16 a 15. La venta ficticia permanece guardada como evidencia.

Esta comprobacion es real de inicio de sesion, pantalla y operacion. No equivale a completar las pruebas de Isaura y Jhissel, ni la recuperacion por correo.

Al salir de Nancy se observo un aviso de consulta pendiente despues del cierre. Se corrigio invalidando las actualizaciones de la sesion anterior y deteniendo Realtime/temporizador antes de esperar la revocacion remota. Prueba local agregada: cierre detiene actualizaciones antes de finalizar la llamada remota. Diez pruebas locales aprobadas; la comprobacion visual del cierre con la nueva version se realizara en la siguiente cuenta.

## Cuenta de Isaura: prueba real de almacen

Inicio de sesion efectuado por el titular. Rol Encargado de almacen. Menu con compras, lotes e inventario, productos, categorias y proveedores; no muestra ventas, gastos, dashboard financiero ni usuarios. Se visualizan costos de lote, cantidades y avisos de vencimiento.

Recepcion registrada desde su interfaz: una Avena y miel a Bs 3,50, proveedor ficticio Distribuidora Illimani, lote QA-ISAURA-20261019 con vencimiento 31/12/2026. Lote nuevo visible con 1/1 paquetes, compra visible en historial por Bs 3,50 y observacion de prueba. Stock agregado 15 a 16; la alerta de minimo desaparece. La compra queda guardada como dato ficticio.

## Cuenta de Jhissel: prueba final de caja

Inicio de sesion efectuado por el titular. Rol Cajero, menu limitado a Ventas, Productos y Avance del proyecto. Al ingresar a Ventas no muestra ningun registro: la venta #0024 de Nancy y las del administrador no aparecen.

Se registro la venta #0025 desde Jhissel: una Avena y miel por Bs 6,00 en efectivo. Comprobante con su nombre y total correctos. Historial posterior de un solo registro, #0025, sin la venta de Nancy. Stock disponible 16 a 15. La venta ficticia queda conservada.

Las cuatro cuentas se probaron con inicio de sesion real: administrador, Nancy, Isaura y Jhissel. El cierre de Isaura regreso al login sin el aviso tecnico observado anteriormente. Recuperacion por correo y exportacion PDF siguen pendientes; no se consideran terminados por estas pruebas.

## Comprobante PDF y recuperacion por correo

Se exporto el comprobante #0025 desde Ventas > Ver comprobante > Imprimir / guardar PDF > Guardar como PDF. Se desmarco Encabezado y pie de pagina. Archivo Comprobante_NutriGalletas_0025.pdf: una pagina A4, Jhissel como cajero, una Avena y miel a Bs 6,00 y aviso sin validez fiscal. Texto extraido y pagina renderizada revisados. No se creo una venta adicional.

La recuperacion aun requiere el servicio remitente y la activacion del Send Email Hook. No se envio un enlace ni se cambio ninguna contrasena. El hook preparado valida el destino antes de consumir la autorizacion temporal, para que un destino incorrecto no invalide una solicitud legitima.

Validacion local posterior: 15 pruebas aprobadas. Cinco pruebas nuevas de auth-email comprueban rechazo de destino externo antes de consumir permiso, rechazo de otras acciones, ausencia de envio sin autorizacion, destinatario/enlace correctos y error del proveedor. Usan servicios simulados: no prueban la firma criptografica real, despliegue del hook ni entrega a un buzon.

## Actualizacion 20/10/2026: correo real activado

Se desplego auth-email, se configuraron MAIL_FROM, RESEND_API_KEY y SEND_EMAIL_HOOK_SECRET (las dos credenciales fueron introducidas por el titular). Se desactivo la comprobacion JWT heredada de esta funcion, que autentica las llamadas mediante la firma del hook. Send Email Hook figura ENABLED con destino auth-email. No se registraron valores secretos en estos documentos.

Desde el formulario Recuperar acceso del administrador se solicito un enlace para lopezmaycolh@gmail.com. Resend muestra un mensaje con asunto Restablece tu acceso a NutriGalletas y estado Delivered, id 01a15933-be0c-7268-96c4-17e229f58690. Esto comprueba el flujo real de solicitud, firma valida, autorizacion temporal y envio aceptado por el servidor de correo destinatario; no confirma que el usuario lo haya abierto.

Pruebas negativas reales: una llamada sin firma a auth-email devolvio HTTP 401. Una solicitud directa a Auth /recover para Nancy fue rechazada: Auth devolvio HTTP 500 unexpected_failure indicando que el hook respondio 403. No equivale a un envio aceptado ni a un cambio de contrasena.

Limites: el remitente onboarding@resend.dev se usa para la prueba del administrador, propietario de la cuenta Resend. La entrega de restablecimientos a empleados aun requiere un remitente que permita esos destinatarios. No se probaron enlaces vencidos ni reutilizados; cambio de contrasena y nuevo inicio de sesion requieren intervencion del titular.
