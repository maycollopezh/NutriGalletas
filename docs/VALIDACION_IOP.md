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
