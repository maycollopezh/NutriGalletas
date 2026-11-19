# Stock mínimo automático por producto

## Fuente única

El mínimo es el punto de pedido: techo(demanda diaria × plazo de entrega + reserva). La demanda diaria puede proceder del historial de días completos o de una estimación explícita configurada. Con historial se anualiza como d × 365 para EOQ, sin sumar demanda anual y diaria entre sí.

`src/domain/operations.js: replenishment` obtiene el mismo umbral del resumen SQL o del modelo local. `src/investigacion-operativa/minimo-producto.js` proyecta ese mínimo sobre cada producto cargado, también en demostración. Nunca usa un valor manual del producto como alternativa. Sin datos suficientes devuelve null y se muestra «Sin estimación».

Productos, su formulario de edición, Inventario, Resumen y Comprar a tiempo utilizan el cálculo. El producto presenta el mínimo como información de solo lectura. El stock libre excluye vencidos y reservas. Para decidir una nueva compra se compara stock libre más unidades en camino con el mínimo, evitando duplicar reposiciones pendientes.

La columna SQL antigua `productos.stock_minimo` se conserva por compatibilidad; no alimenta alertas, no se edita ni se envía al guardar productos. Al cargar, el modelo de lectura de la web reemplaza ese valor por el cálculo actual. No se mantiene una copia persistida que quede vieja al cambiar el día.

## Dónde configurarlo

Administrador: Comprar a tiempo > nombre del producto > ajustar recomendación. Se configura demanda, días que tarda el proveedor y reserva manual o estadística. El mínimo no se escribe a mano. Las nuevas ventas actualizan el stock inmediatamente; la demanda histórica incorpora los días cuando se completan.

## De dónde sale el plazo de entrega

Es un parámetro `parametros_inventario.plazo_entrega_dias`, ingresado por el administrador. Los 3 días originales proceden del ejemplo académico de la migración 003, no de mediciones ni de una conexión con el distribuidor. Debe ajustarse a lo acordado con el proveedor o a entregas observadas. El sistema actual no registra la fecha en que se pidió al proveedor, por lo que no puede medir automáticamente ese plazo a partir de compras recibidas.

## Publicación

Este cambio solo afecta a la aplicación web y a su lectura del mínimo. Las alertas de IA ya usan `consultar_resumen_inventario()` y su campo `minimo_reposicion`, y no requieren otro despliegue. No requiere migraciones ni cambios de credenciales. GitHub activa el despliegue de Netlify mediante el flujo existente. No se ejecutaron pruebas funcionales.
