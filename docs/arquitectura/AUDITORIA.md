# Auditoría de todos los usuarios

## Uso

El administrador abre **Auditoría** en el menú Organización. Ve acciones de administradores, cajeros y almacén; puede filtrar por fechas de Bolivia, usuario y acción, ver los cambios y descargar **.log**. La primera página se actualiza cada 15 segundos mientras está visible, sin reemplazar un detalle abierto. Los otros roles generan registros pero no pueden leer esta pantalla ni consultar su RPC.

La descarga contiene una cabecera y un objeto JSON por línea (JSONL), con fecha UTC, usuario, rol, acción, entidad, registro, origen, resultado, campos modificados y valores autorizados antes/después. Exporta todas las páginas del filtro; si supera 50.000 eventos pide reducir fechas, sin entregar un archivo recortado silenciosamente. El servidor registra la solicitud de exportación; no puede comprobar que el navegador haya terminado de guardar el archivo.

## Arquitectura y archivos

- `src/features/auditoria/registro.js`: filtros, paginación, actualización y descarga.
- `src/services/supabase.js`: eventos de navegación de una sesión identificada.
- `src/domain/domain.js` y `src/app.js`: acceso y navegación del administrador.
- `supabase/migrations/012_auditoria.sql`: tabla privada, disparadores y RPC protegidas.
- `supabase/functions/admin-access/index.ts`: guarda perfiles mediante una RPC que conserva al administrador responsable en la misma transacción.
- `supabase/functions/nutri-ai/index.ts`: identifica al administrador al pausar/reanudar conversaciones desde la web.

## Qué se registra

1. **Cambios confirmados**: altas, modificaciones y bajas en productos, categorías, proveedores, compras/detalles, ventas/detalles, lotes, movimientos, parámetros de inventario, configuración y pedidos de WhatsApp, reservas, comprobantes (sin su contenido), recibos y estados del asistente. Un disparador AFTER escribe el historial dentro de la misma transacción: si una venta falla y se revierte, tampoco queda una venta confirmada en el log. Varias filas de una operación comparten el número de transacción.
2. **Accesos**: autorizaciones y revocaciones de sesión, intentos fallidos que llegan al registro existente y solicitudes de recuperación autorizadas. Un intento fallido o una recuperación propia solicitada sin autenticar no acreditan quién escribió el correo; figuran como no identificados. El cierre local del navegador o la caducidad de un JWT no equivalen a un cierre de sesión explícito y no generan una revocación inmediata.
3. **Interfaz**: visitas a módulos, aperturas de detalle identificadas por la aplicación y apertura de YCloud. Se validan sesión y módulo, pero siguen siendo telemetría del navegador: pueden faltar si se interrumpe la red y no prueban una transacción. No se registran teclas, cada clic ni cada lectura técnica de la base.

Las RPC de negocio exclusivas del backend reciben contexto transaccional de auditoría. Las operaciones de IA conservan al usuario administrativo; las de pedidos conservan al cajero/administrador verificado cuando participa. Las acciones automáticas o del cliente sin cuenta de plataforma figuran como **Sistema / cliente de WhatsApp**. No se atribuyen a un empleado inventado.

## Protección y límites

- `private.registro_auditoria` tiene RLS y carece de permisos directos para usuarios y para la clave de servicio. Solo las funciones internas pueden insertar. Un disparador rechaza UPDATE, DELETE y TRUNCATE.
- `consultar_auditoria` exige `rol_actual() = administrador`, incluida la autorización de sesión del sistema. No basta cambiar un rol en el navegador.
- No guarda contraseñas, JWT, claves, correos, teléfonos, URLs privadas, imágenes, referencias bancarias, historial completo ni notas libres. Los nombres de campos cambiados pueden aparecer sin guardar sus valores privados. Los campos numéricos y de estado autorizados están en `private.datos_auditables`.
- El dueño de PostgreSQL conserva capacidad administrativa: esto protege frente a los usuarios de la plataforma; no es almacenamiento externo inviolable ni una firma criptográfica del archivo descargado.
- Comienza al activar la migración. No reconstruye actividad previa, no existe retención/borrado automático y el modo demostración local no crea auditoría central.
- Las funciones de negocio modificadas en el futuro deben conservar el contexto `app.auditoria_actor` / `app.auditoria_origen` que añade la migración. Nuevas tablas requieren su disparador correspondiente.

## Activación

1. Aplicar `012_auditoria.sql` en el proyecto actual de Supabase, después de las migraciones anteriores.
2. Desplegar `admin-access` y `nutri-ai` conservando `verify_jwt=false`: ambas verifican sus acciones privilegiadas dentro del manejador existente.
3. Publicar el frontend desde la rama principal; Netlify usa `node scripts/build.mjs`.

Por instrucción del usuario no se ejecutaron pruebas funcionales ni se generaron compras, ventas o usuarios ficticios. Las revisiones de sintaxis, formato y empaquetado no sustituyen su comprobación final.
