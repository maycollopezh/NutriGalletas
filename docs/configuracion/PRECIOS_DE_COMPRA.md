# Precio de venta al recibir compras

Cada lote conserva su costo por paquete. El producto mantiene un precio de venta vigente para las ventas futuras de la web y WhatsApp.

En Compras se muestra el precio actual, un porcentaje sugerido sobre costo (33% inicialmente), el precio recomendado y la ganancia bruta por paquete. El usuario puede cambiar el porcentaje o escribir un precio propio. La casilla «Actualizar el precio de venta al guardar esta compra» está visible y marcada inicialmente; puede desmarcarse para conservar el precio actual.

Ejemplo: costo Bs5 × 1,33 = venta Bs6,65; ganancia bruta Bs1,65. Ese 33% es sobre el costo, no sobre el precio de venta. Se advierte si el precio elegido no deja ganancia sobre el nuevo lote. No garantiza rentabilidad neta.

La compra, el lote y el cambio de precio se guardan en una sola transacción. Se verifica otra vez el precio anterior para evitar sobrescribir una modificación concurrente. Se guarda auditoría privada del cambio. Las ventas históricas, los costos de lotes anteriores y los pedidos ya aprobados conservan sus importes.

Los roles que ya podían recibir compras y editar productos mantienen esos permisos. La IA solo modifica el precio cuando se le pide explícitamente y muestra el cambio antes de CONFIRMAR. Si no se solicita, su borrador conserva el precio actual y muestra la recomendación.

Gastos se retiró del menú, formularios, asistente e informes actuales. La base conserva el archivo histórico, sin admitir registros nuevos desde la aplicación. El resumen y PDF muestran ganancia bruta = ventas − costo de los productos vendidos. Los parámetros de EOQ y reposición no cambian.

Migración: 011_precios_compra_y_retiro_gastos.sql. Las pruebas funcionales quedan a cargo del propietario.
