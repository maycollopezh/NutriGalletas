# Investigación Operativa II: modelos implementados

## Uso

Abrir **Planificación de inventario**. Administrador configura; almacén consulta. El cajero no accede a los parámetros ni a la demanda agregada.

Cada producto tiene parámetros persistidos en Supabase. Las seis variedades originales incluyen un ejemplo **ficticio explícito**, editable: demanda anual 1460 paquetes, costo por pedido Bs 20, mantenimiento Bs 2 por paquete/año, entrega 3 días, reserva 6 paquetes, vida útil esperada 60 días y capacidad 300 paquetes. Los productos nuevos requieren configuración. No se alteran ventas, compras ni stock con estos ejemplos.

## Cálculos y unidades

- EOQ clásico: `sqrt(2 D S / H)`. D en paquetes/año, S en Bs/pedido y H en Bs/paquete/año. Se compara el costo de piso y techo para elegir una cantidad entera. H no es el precio de compra.
- Costo anual de inventario: `D/Q*S + (Q/2+SS)*H`. Excluye costo de compra y otros gastos. Se comparan medio pedido, EOQ y doble pedido con los mismos supuestos.
- Demanda diaria: anual declarada / 365, o unidades vendidas durante el período / número de días calendario completos. Historial entre 7 y 365 días, incluye ceros y excluye hoy usando America/La_Paz. El usuario debe verificar que el historial cubra el período.
- Reserva: unidades manuales, o `ceil(z*desviación diaria muestral*sqrt(L))`. El método estadístico requiere fuente histórica. Niveles 90%, 95%, 97.5%, 99%. Supone demanda diaria independiente, aproximación normal y entrega constante. Objetivo de servicio por ciclo, sin garantía empírica.
- Punto de pedido: `ceil(d*L+SS)`. Se activa cuando stock vendible + unidades en camino <= punto. No sustituye el mínimo manual, que sigue siendo una alerta administrativa distinta.
- Cobertura: stock vendible / d. Excluye vencidos y pendientes de recepción. Sin demanda positiva, indica datos insuficientes, sin dividir por cero. Fecha orientativa, no predicción garantizada.
- Cantidad práctica: mínimo entre EOQ entero, capacidad libre y demanda esperada durante la vida útil restante declarada para la nueva recepción. Se descuenta de ambos límites la posición actual. Resultado mínimo cero. Se muestra que limitar EOQ puede perder su mínimo de costo clásico.

Los paquetes en camino son una declaración manual del administrador, no órdenes de compra verificadas ni fechas de entrega. Un trigger descuenta cada nueva recepción del mismo producto de ese saldo, hasta cero, dentro de la transacción de compra. Revisar antes de decidir una nueva compra. No existe aprobación ni envío automático a proveedores.

La caducidad sigue usando fechas y FEFO. La restricción por vida útil es aproximada y no garantiza ausencia de mermas.

## Base de datos y seguridad

Aplicar `supabase/003_inventarios_iop.sql` después de 001 y 002, una sola vez. No volver a ejecutar 001 sobre la base existente. El incremento crea `public.parametros_inventario`, restricciones, RLS y `consultar_demanda_inventario()`. Esta RPC exige sesión autorizada y entrega solamente producto, fecha y cantidad agregada. No entrega importes ni cajeros a almacén.

Ahora hay **12 tablas public**, más `auth.users`: **13 entidades** si se amplía el esquema simplificado. Existen además las cuatro tablas privadas de seguridad. El diagrama anterior de 12 entidades no incluye este incremento.

## Verificación

`npm test` incluye cálculos conocidos, reserva estadística, calendario boliviano, ausencia de ventas, límites, validación, escape de HTML, roles y carga cloud. `node tests/inventory-sql.mjs` comprueba restricciones, RLS, demanda agregada y recepción atómica en PostgreSQL local. `tests/cloud-inventory-checks.sql` comprueba políticas reales con identidades SQL simuladas en una transacción revertida: no sustituye accesos Auth reales.

## Ejemplo para exponer

Con los valores iniciales: demanda diaria 4, reserva 6 y punto de pedido 18. EOQ entero 171 paquetes. Con stock 10 y sin pedidos pendientes: cobertura 2.5 días y EOQ práctico 171, sujeto a los límites. Con 20 unidades en camino: posición 30, no se recomienda otro pedido, pero el stock actual sigue cubriendo 2.5 días y podría agotarse antes de una entrega a 3 días.

IA, WhatsApp, Gmail para empleados, ABC y publicación final no forman parte de este incremento.

Referencias: https://ocw.mit.edu/courses/esd-273j-logistics-and-supply-chain-management-fall-2009/resources/mitesd_273jf09_lec02/ y https://ocw.mit.edu/courses/esd-260j-logistics-systems-fall-2006/resources/lect11/
