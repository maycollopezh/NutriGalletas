# Alcance acordado y cuatro sprints

## Un proyecto para dos materias

Programación III: página web con HTML, CSS y JavaScript; Supabase online; IA con Make, YCloud y OpenAI. Inventario, ventas, gastos y dashboard se incluyen por la lógica del negocio. Se emiten comprobantes internos, sin facturación fiscal.

Investigación Operativa II: aplicación futura de Teoría de Inventarios con EOQ, tal como se presentó a la docente. El primer avance solicitado es administrativo, mínimo 50 %, sin aplicar todavía el modelo matemático. Debe mostrar registro de usuarios, seguridad, recuperación, control de intentos, datos ficticios coherentes y el modelo relacional.

La tienda compra galletas terminadas. Es una sola tienda, para trabajadores. No incluye producción, tienda de clientes, pagos online, delivery, SIAT ni contabilidad empresarial completa.

Nombre provisional de la aplicación: **NutriGalletas**. No corresponde a un negocio real.

## Perfiles

| Función | Administrador | Cajero | Almacén |
|---|---|---|---|
| Usuarios y recuperación de empleados | Sí | No | No |
| Categorías / productos | Gestiona | Consulta productos y disponibilidad | Gestiona |
| Proveedores / compras recibidas / lotes | Sí | No | Sí |
| Registrar ventas | Sí | Sí | No |
| Historial y comprobantes | Todas las ventas | Solo propias | No |
| Gastos / dashboard financiero | Sí | No | No |
| EOQ y reposición futura | Consulta y decide | No | Consulta recomendaciones |
| Asistente IA futuro | Número autorizado | No | No |

El almacén registra mercadería ya recibida. El flujo de solicitudes y aprobación de compras no se implementa en esta entrega; no hay compras externas automáticas. La recomendación futura de EOQ nunca ejecutará una compra.

## Sprint 1: estructura, usuarios y productos

Objetivo: base del sistema, acceso y catálogo conectados a Supabase.

Implementado localmente: interfaz adaptable, tres perfiles de demostración, gestión de usuarios, categorías, productos y proveedores. Preparado: esquema, permisos, creación de usuarios, recuperación y control de intentos mediante funciones de Supabase.

Criterio final: probar en Supabase registro administrativo, inicio de sesión de los tres roles, restricciones de datos, recuperación de administrador y creación/edición de productos. La demostración no sustituye esta validación.

## Sprint 2: ventas e inventario

Objetivo: compras recibidas, lotes, ventas y trazabilidad de existencias.

Implementado localmente: recepción de un producto/lote por compra, costo histórico, total automático, métodos de pago, descuento de stock, consumo por vencimiento más próximo, exclusión de vencidos, historial propio y comprobantes imprimibles. Las compras y ventas tienen tablas de detalle para admitir ampliaciones sin cambiar la estructura.

Criterio final: probar RPC de compras y ventas en Supabase, rechazo de stock insuficiente, rollback, ventas concurrentes y actualización entre dos sesiones reales.

## Sprint 3: gastos, dashboard y modelos de inventarios

Implementado localmente: registro/edición de gastos, filtros de fecha, ventas, costo vendido, gastos, resultado neto estimado, gráfico y ranking de ventas; avisos administrativos de mínimo manual y vencimiento a 15 días.

Pendiente: EOQ clásico, punto de pedido, clasificación ABC y estimación de cobertura. No se contabilizan como implementados en este avance.

EOQ necesita demanda por período, costo por pedido y costo de mantenimiento por unidad para el mismo período. El punto de pedido necesita demanda diaria y tiempo de entrega, más stock de seguridad si se adopta. Los parámetros se documentarán como datos ficticios; no se inventarán silenciosamente.

La cobertura será stock vendible dividido entre demanda diaria estimada. Sin ventas, mostrará datos insuficientes. El vencimiento se evalúa por lote y no se presentará como resultado del EOQ.

## Sprint 4: IA, integración y pruebas finales

Pendiente: implementación de Make, YCloud y OpenAI; restricciones del número autorizado; alertas proactivas; PDF semanal por correo; análisis por período; consultas de comprobantes y vendedores; documentación de defensa y validación final.

Ver IA_PLANIFICADA.md para preservar todas las funciones acordadas.

## Avance para la presentación

Este incremento desarrolla los sprints 1 y 2 y parte del 3. No se interpreta automáticamente como 75 %: la conexión real, la recuperación y los permisos online aún están pendientes. La docente valida el porcentaje con su rúbrica y acepta o ajusta las ocho entidades principales.

El siguiente paso después de revisar la interfaz es crear Supabase, cargar el modelo, configurar las funciones y validar el sistema conectado. GitHub y Netlify se utilizarán al final, como indicó el usuario.


## Actualización 20/10/2026: modelos IOP

El incremento implementa EOQ, punto de pedido, reserva manual/estadística y cobertura. Ver MODELOS_INVENTARIO.md para parámetros, supuestos y límites. La conexión real y las cuatro cuentas ya se probaron en octubre. El correo del administrador funciona; empleados, IA y publicación siguen pendientes. Los apartados anteriores describen el plan inicial y no sustituyen este estado actualizado. ABC queda fuera de este incremento.
