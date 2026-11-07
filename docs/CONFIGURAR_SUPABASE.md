# Crear y conectar Supabase

Estado actualizado al 20 de octubre de 2026: proyecto NutriGalletas creado (jdfemijbeqxwcilyhxxv). Esquema instalado y RLS activo en las 15 tablas public/private. admin-access desplegada; origen y retorno locales configurados; registro publico y acceso anonimo deshabilitados. Contrasenas de al menos 12 caracteres.

Cuatro cuentas activas: administrador Maycol; Nancy y Jhissel en caja; Isaura en almacen. Inicio de sesion del administrador y operaciones reales de compra/venta comprobados. 29 pruebas de permisos SQL correctas; proteccion de usuario inactivo comprobada en SQL. Concurrencia real, rechazo de lotes duplicados y bloqueo tras cinco fallos verificados. Realtime comprobado entre dos conexiones autenticadas del administrador y ajuste de autenticacion aplicado al sistema. Validacion local de dominio y ciclo de sesion: 10 pruebas correctas.

Inicio de sesion y pantallas de los cuatro usuarios comprobados; exportacion de comprobante a PDF verificada. auth-email desplegada y Send Email Hook activo; recuperacion del administrador solicitada y correo Delivered en Resend. Pendientes: cambio de contrasena por el titular, nuevo login, uso unico/vencimiento del enlace y entrega a empleados con remitente verificado. Ver docs/PRUEBAS_SUPABASE.md para evidencia y limites. src/config.js usa Supabase real. No repetir 001_schema.sql ni la carga inicial: ya estan aplicados.

Los pasos siguientes sirven como guía reproducible; los marcados arriba ya se realizaron.

## 1. Crear el proyecto

En https://supabase.com/dashboard crea un proyecto para NutriGalletas. Usa una contraseña de base de datos fuerte y guárdala en tu gestor de contraseñas. No la pegues en el chat ni en el código. La región y el plan se eligen según las opciones disponibles de tu cuenta; no es necesario contratar un plan sin verificar los requisitos.

## 2. Crear las tablas

En SQL Editor ejecuta **una sola vez** `supabase/001_schema.sql`. Está diseñado para un proyecto vacío. No ejecuta borrados de tablas ni modifica un proyecto existente.

El script crea las entidades administrativas, detalles, movimientos, políticas RLS y funciones de venta/compra. Los usuarios autenticados no tienen permiso para modificar saldos ni cabeceras/detalles directamente.

## 3. Crear el primer administrador

En Authentication → Users crea manualmente el primer usuario con tu correo real y contraseña de al menos 12 caracteres. Después agrega su perfil mediante SQL Editor:

```sql
insert into public.perfiles_usuarios (id, nombre, email, rol)
select id, 'Nombre del administrador', lower(email), 'administrador'
from auth.users
where email = 'CORREO_REAL_DEL_ADMINISTRADOR';
```

Sustituye el nombre y correo antes de ejecutar. Comprueba que el resultado contiene exactamente un perfil. No se permite registrarse públicamente para convertirse en administrador.

## 4. Configurar Auth

- Mantén habilitado el proveedor Email/Password, pero deshabilita nuevos registros públicos.
- Establece longitud mínima de contraseña de 12 caracteres.
- Usa inicialmente `http://127.0.0.1:4317` como Site URL y `http://127.0.0.1:4317/` como URL de redirección autorizada.
- Revisa los límites de Auth y la configuración de sesiones. Los límites propios de la aplicación se suman a los de Supabase.
- No almacenes roles privilegiados en metadata editable por el usuario; la autoridad está en `perfiles_usuarios`, cuyos cambios requieren el administrador autenticado.

## 5. Función de acceso y usuarios

Despliega `supabase/functions/admin-access/index.ts` como función `admin-access`.

Configuración: `verify_jwt = false`, porque login/recuperación se hacen antes del inicio de sesión. **Las operaciones de usuarios verifican el JWT y el rol dentro de la función**; no es una función administrativa abierta.

Variables del servidor:

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | URL del proyecto; disponible en el entorno de funciones. |
| `SUPABASE_ANON_KEY` | Clave anon del proyecto, usada por el cliente Auth del servidor. |
| `SUPABASE_SERVICE_ROLE_KEY` | Secreto de servicio disponible en el entorno de funciones; nunca en la página. |
| `APP_ORIGIN` | `http://127.0.0.1:4317` |
| `RECOVERY_REDIRECT_URL` | `http://127.0.0.1:4317/` |

Si usas la CLI, ejecuta desde PROYECTO después de iniciar sesión y vincular el proyecto:

```sh
supabase functions deploy admin-access --no-verify-jwt
```

La creación de usuarios dentro de la app utiliza una contraseña inicial de 12 caracteres o más. No se imprime ni se guarda en tablas. El correo queda fijo para evitar desincronización entre Auth y el perfil; nombre, rol y estado se pueden editar.

## 6. Recuperación restringida y correo

Ocultar el botón de recuperación de empleados no impide que alguien invoque la API pública de Auth. Por eso se prepara el **Send Email Hook** `auth-email`, que verifica firma de Supabase y acepta únicamente recuperaciones autorizadas por la función administrativa.

El administrador puede solicitar su propio enlace. Para empleados, el administrador inicia el restablecimiento desde Usuarios; el enlace se manda al correo del empleado, quien establece su nueva contraseña.

Resend esta configurado para la prueba del administrador. MAIL_FROM usa NutriGalletas <onboarding@resend.dev>. La cuenta Resend corresponde al correo del administrador. La entrega al administrador fue verificada; este remitente de prueba no habilita el envio general a los empleados. Se requiere un remitente verificado para completar esos restablecimientos.

Secretos adicionales del servidor: `SEND_EMAIL_HOOK_SECRET` generado en Auth Hooks, `RESEND_API_KEY`, `MAIL_FROM` con remitente validado y `RECOVERY_REDIRECT_URL` exacta.

```sh
supabase functions deploy auth-email --no-verify-jwt
```

En Authentication → Hooks activa Send Email, apunta a `https://TU_PROYECTO.supabase.co/functions/v1/auth-email` y configura el secreto de firma. Mantén Email Provider habilitado. El hook sustituye el correo interno de Supabase.

**La recuperación solo para el administrador, con restablecimiento de empleados mediado por él, no se considera terminada hasta activar y probar el hook.** Sin ese hook, no se puede afirmar que la API pública de recuperación de empleados esté restringida.

## 7. Configuración pública de la página

Edita `src/config.js`:

```js
mode: 'supabase',
supabaseUrl: 'https://TU_PROYECTO.supabase.co',
supabasePublishableKey: 'TU_CLAVE_PUBLICA_PUBLISHABLE_O_ANON',
```

La URL y clave pública son compartibles y pueden estar en GitHub. La clave service_role, contraseña de BD y secretos de OpenAI/YCloud/correo no van aquí. La clave pública solo es segura con los permisos correctamente configurados.

## 8. Datos ficticios

Inicia sesión como administrador y crea las cuentas de los compañeros con correos utilizables para pruebas de recuperación. Opcionalmente ejecuta `supabase/002_seed.sql` una sola vez con el catálogo vacío.

La carga crea seis galletas, tres categorías, dos proveedores ficticios, siete compras/lotes, veintiuna ventas y dos gastos. Las fechas se calculan respecto a la fecha local de La Paz. Las ventas se asignan al primer cajero activo, o al administrador si aún no existe cajero. No crea usuarios Auth artificiales.

## 9. Sincronización

Habilita Realtime para las tablas operativas que requieran actualizaciones en la página. Por ejemplo, agregar `productos`, `lotes_inventario`, `ventas`, `compras` y `gastos` a la publicación `supabase_realtime`, desde la configuración del proyecto.

La página escucha cambios autorizados y además actualiza cada 15 segundos mientras está visible y sin un formulario abierto. El cajero obtiene disponibilidad por RPC, sin acceso a filas con costo de compra. La venta se valida de nuevo en el servidor aunque su pantalla tenga un stock antiguo.

## 10. Pruebas obligatorias antes de presentar

1. Credenciales correctas/incorrectas en tres roles; usuario inactivo sin acceso.
2. Cinco fallos: rechazo temporal. Esperar o ajustar el contador solo en un entorno de prueba, sin cambiar reglas de producción.
3. No poder acceder a datos con sesión obtenida fuera del flujo autorizado.
4. Cajero ve únicamente sus ventas y no modifica rol ni inventario.
5. Almacén recibe compras pero no registra ventas ni consulta gastos.
6. Compra crea lote, detalle y entrada; venta descuenta stock y genera comprobante.
7. Dos ventas simultáneas no superan el stock; la segunda se rechaza si corresponde.
8. Admin recupera acceso; empleado no solicita recuperación directa; admin sí puede restablecerlo.
9. Verificar correos, enlaces, vencimiento/uso único y rechazo de firmas inválidas del hook.
10. Verificar actualización entre dos sesiones y errores de conexión sin sustitución por datos ficticios.

Referencias oficiales: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [crear usuarios](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [límites Auth](https://supabase.com/docs/guides/auth/rate-limits), [Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook).
