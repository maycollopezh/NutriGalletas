# Registro histórico de validaciones

Estas notas describen revisiones de fechas anteriores; no certifican el estado actual. Los cambios de estructura y formato no han ejecutado estas pruebas. Para las pruebas que faltan, consultar la implementación de IA y los comandos del README. Las conclusiones de cada fecha se conservan como evidencia histórica.

## Entrega inicial

> Registro de la entrega inicial. Sus apartados de pendientes se conservan como historia y pueden haber sido resueltos después.

# Validación de esta entrega

## Pruebas de reglas de negocio

`npm test`: seis pruebas automatizadas del modo de demostración. Comprueban consumo por vencimiento, conservación de precio/costo, rechazo de sobreventa con líneas repetidas, rechazo de cantidades inválidas, exclusión de vencidos, permisos, recepción de compra y resultado neto con fechas locales.

## PostgreSQL local

`tests/integration/sql-validation.mjs` ejecuta el esquema SQL y la carga de ejemplo en PGlite, un PostgreSQL local. Simula únicamente las funciones de identidad `auth.uid()` / `auth.jwt()` y usuarios de Auth, para evaluar las políticas. No simula ni demuestra la entrega real de correo o la autenticación remota.

Instala la dependencia de desarrollo y ejecuta:

```sh
npm install
npm run test:db
```

También se puede pasar `PGLITE_MODULE_PATH` como URL de un módulo instalado temporalmente. No hace falta esta dependencia para abrir la demostración.

Resultado verificado durante el desarrollo: **19 comprobaciones correctas**:

- Saldos ficticios reconciliados con movimientos.
- Precio, costo y descuento correctos en venta SQL.
- Rechazo de cantidades fraccionarias y sobreventa por productos duplicados.
- Venta fallida sin registros parciales.
- Cajero solo ve sus ventas y no obtiene proveedores/costos de inventario.
- Consulta de cantidades permitida sin revelar costos.
- Sin modificación directa de saldos ni ascenso del propio rol.
- Almacén sin acceso a ventas ni permiso para registrarlas.
- Recepción de compra con total correcto.
- JWT sin sesión autorizada rechazado por las políticas.
- Bloqueo tras cinco fallos y rechazo de datos durante el bloqueo.
- Autorización de recuperación de un solo uso.

## Verificación de código y publicación

Sintaxis revisada para los módulos JavaScript y las dos funciones TypeScript. El empaquetado para Netlify debe contener únicamente interfaz y configuración pública.

## Pruebas de interfaz

Verificado en el navegador integrado, con la interfaz adaptable a una ventana estrecha:

- Dashboard: ingresos, costos, gastos, resultado y gráfico legibles.
- Administrador: venta de un paquete de avena por Bs 6; comprobante interno #0022 generado; stock de 12 a 11.
- Cajero Jhissel: historial con cuatro ventas propias dentro del período, sin la venta #0022 del administrador ni las de la segunda cajera.
- Almacén: recepción de diez paquetes de avena por Bs 3,50 cada uno; compra por Bs 35 y lote nuevo con diez unidades.
- Inventario: lote recibido visible, producto fuera del mínimo tras la recepción, un lote próximo a vencer y un lote vencido separado.

Las operaciones de esta revisión son ficticias y solo modificaron datos de demostración del navegador. No se probaron todavía envío de correo, impresión física, integración Supabase ni el proveedor de IA. No se presenta una revisión en una ventana estrecha como prueba exhaustiva de todos los tamaños.

## Pendientes reales

Crear/conectar Supabase; ejecutar el esquema sobre el proyecto; desplegar funciones; configurar y probar correo; probar usuarios reales, revocación, recuperación, Realtime y concurrencia entre dos sesiones. GitHub y Netlify permanecen pendientes para el despliegue final. La IA y los modelos de IO aún no están implementados.

No se afirma certificación de seguridad ni cumplimiento automático de un porcentaje académico. Los criterios de evaluación y la interpretación de «tablas madre» los valida la docente.


## Supabase — octubre de 2026

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
- tests/integration/checks/cloud-role-checks.sql: ejecutado en Supabase, 29 de 29 comprobaciones correctas. Resultado completo verificado en CSV exportado del SQL Editor. Prueba de las politicas reales con identidades y sesiones simuladas dentro de una transaccion revertida; no sustituye el inicio de sesion de cada empleado.
- tests/integration/checks/cloud-inactive-checks.sql: tres comprobaciones correctas de usuario temporalmente inactivo: no obtiene rol, no consulta productos y no registra ventas. Contexto simulado en SQL. La transaccion se revierte y Nancy queda activa.
- tests/manual/supabase.html: dos llamadas simultaneas reales a registrar_venta con una unica unidad disponible. Una venta aprobada y otra rechazada por stock insuficiente. Saldo final 0; una unidad vendida. Ambos clientes usan la sesion real del administrador.
- Lote duplicado rechazado por unicidad; una sola compra y detalle, sin registro residual del intento duplicado.
- Endpoint real de acceso, correo ficticio exclusivo: [401,401,401,401,401,429]. Bloqueo comprobado tras cinco fallos; no se bloquearon las cuentas del equipo. El contador ficticio queda sujeto a su expiracion normal.
- Realtime: primer intento fallido por autorizacion de suscripcion. Con autenticacion explicita de la sesion existente y confirmacion system/status=ok, B recibe el cambio guardado por A. Verificado en tests/manual/realtime.html, entre dos conexiones del administrador.
- Correccion aplicada en src/services/supabase.js: autenticar Realtime antes de suscribir; evitar suscripciones pendientes tras cierre. src/app.js espera el arranque. Se mantiene actualizacion periodica de 15 segundos.

## Registros de prueba conservados

La venta #0022 y compra de cinco paquetes permanecen en los datos ficticios. Para concurrencia se creo el producto exclusivo QA-1792464556087, con una compra y una venta por Bs 0,01; el producto fue desactivado al terminar. La comprobacion aislada de Realtime solo cambia la presentacion de ese producto ya desactivado. No se borraron registros ni se reinicio la base.

## Pendiente

1. Inicio de sesion real de las cuatro cuentas completado. Separacion de ventas entre Nancy y Jhissel comprobada desde sus interfaces.
2. Rechazo del inicio de sesion de un empleado inactivo con su contrasena real; la proteccion en base de datos ya fue comprobada.
3. Cierre/revocacion de sesiones y finalizacion de recuperacion: falta que el titular abra el correo, cambie su contrasena e inicie sesion nuevamente.
4. Correo del administrador activado y entregado con Resend el 20/10/2026. Pendiente: cambio real de contrasena por el titular, uso unico/vencimiento del enlace y entrega a empleados con remitente verificado. No se enviaron correos a los companeros.
5. Exportacion PDF completada: comprobante #0025 guardado desde Chrome en una pagina; contenido y render verificados, sin menus ni encabezado/pie del navegador.

## Evidencia y reproduccion

Bateria SQL: tests/integration/checks/cloud-role-checks.sql y tests/cloud-inactive-checks.sql. No ejecutar parcialmente ni retirar el ROLLBACK final. Las paginas tests/manual/supabase.html y tests/manual/realtime.html son herramientas locales de prueba, excluidas de dist/ por el proceso de build; no forman parte del menu del sistema. No contienen secretos. No volver a ejecutar la bateria completa de concurrencia sin necesidad: crea nuevos registros ficticios.

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


## Investigación Operativa

# Validación del incremento IOP

20/10/2026. Entorno académico con datos ficticios.

- 29 pruebas JavaScript aprobadas, incluyendo las 15 previas y 14 nuevas.
- 19 comprobaciones nuevas PostgreSQL local: parámetros, RLS, permisos por rol, datos agregados, validación y recepción atómica de pendientes.
- 19 comprobaciones anteriores PostgreSQL local aprobadas.
- Script cloud preparado y comprobado en PostgreSQL local: 16 comprobaciones con identidades SQL simuladas dentro de ROLLBACK. La ejecución real en Supabase se documentará al verificarla.
- Compilación del sitio aprobada.

Los resultados locales no prueban la instalación de 003 en la nube ni el nuevo flujo con inicios de sesión Auth reales. No se cambiaron contraseñas ni se enviaron correos.

Supabase real: el titular ejecutó 003_inventarios_iop.sql. Se observó en SQL Editor «Success. No rows returned». Pendiente prueba de carga de la nueva pantalla con Auth real y ejecución de cloud-inventory-checks.sql.

Interfaz local de demostración: formulario bloquea H=0 y reserva estadística con fuente manual; permite guardar demanda histórica, recalcula EOQ/SS/punto/cobertura y abre el detalle. Almacén consulta sin controles de edición; cajero no ve planificación. Esta revisión no equivale a Auth cloud.

## Prueba real de la nueva pantalla en Supabase

El titular inició sesión como administrador. La nueva pantalla cargó seis configuraciones. Para Avena y miel, stock 15, demanda 4/día, EOQ 171, reserva 6, punto 18 y cobertura aproximada 3.8 días. Cambiar S de 20 a 21 se guardó en Supabase y actualizó EOQ a 175. Al elegir historial y reserva estadística: demanda 0.633/día, EOQ 68, reserva 5, punto 7 y cobertura aproximada 23.7 días. Se restauró la fuente manual, reserva manual y costo 20. No se registraron nuevas ventas ni compras en estas pruebas reales.

La nueva RPC y la tabla funcionaron con Auth real de administrador. Las restricciones de almacén/caja del incremento se probaron localmente; cloud-inventory-checks.sql queda preparado, no ejecutado en la nube.

Carga inicial optimizada: consultas de tablas en paralelo, paginación secuencial dentro de cada tabla y mensajes «Iniciando sesión» / «Cargando datos». Prueba automatizada verifica que las 12 consultas empiezan sin esperar a que termine la anterior. No se midió una reducción de latencia en el inicio de sesión real después de este ajuste. El cliente ya abierto utilizará el ajuste en su próxima recarga.
