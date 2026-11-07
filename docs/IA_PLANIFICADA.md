# Inteligencia Artificial: alcance preservado para el sprint 4

La IA es un asistente administrativo de consulta y apoyo. No es un bot de pedidos de clientes ni delivery. Se integra con Make, YCloud, OpenAI y Supabase. El usuario dispone de un número conectado a YCloud y reportó USD 4,80 de saldo en OpenAI; saldo, costos y disponibilidad deberán verificarse al implementar.

## Acceso

Solo el número autorizado del administrador, verificado antes de cualquier consulta. Los eventos de YCloud deben autenticarse/validarse antes de confiar en el remitente. Rechazar otros números sin revelar ventas ni existencias. Usar una conexión de lectura o consultas acotadas; no ejecutar SQL generado libremente por el modelo.

El correo semanal se envía únicamente al correo verificado del administrador. Las claves y secretos se guardan en Make o en el servidor. La IA no registra ventas, modifica stock, ejecuta compras ni cambia usuarios.

## Consultas acordadas

1. Resumen del día: ingresos, costo histórico vendido, gastos, resultado neto estimado y productos más vendidos.
2. Comparación de períodos diarios, semanales, mensuales y rangos personalizados.
3. Ganancias brutas y netas estimadas, separando el costo de los productos vendidos, sin prometer contabilidad fiscal ni exactitud superior a los datos registrados.
4. Top de ventas por unidades e ingresos; aclarar la medida usada.
5. Productos estancados: definir ventana y distinguir productos nuevos de productos con poco movimiento.
6. Márgenes: `(precio - costo) / precio`; recargo: `(precio - costo) / costo`. Meta configurable; 33 % es una referencia por confirmar.
7. Consulta del detalle de comprobantes internos por número.
8. Resumen de ventas por vendedor.
9. Explicación de indicadores y cambios a partir de registros, sin atribuir causas no demostradas.
10. Recomendaciones de reposición basadas en EOQ, punto de pedido y cobertura, con vencimientos y límites del modelo explicados.

## Avisos proactivos por WhatsApp

- Stock en o por debajo del mínimo/punto de pedido.
- Riesgo de agotamiento según días de cobertura y tiempo de entrega.
- Lotes disponibles a 15 días o menos de vencer; vencidos en sección separada.
- Agrupar por producto/lote y evitar repetir avisos sin cambios. Registrar envíos, estado, fecha, destinatario, reintentos y clave de deduplicación en la migración de IA.
- Fuera de la ventana de atención de WhatsApp, usar plantillas aprobadas. Confirmar tarifas, categorías y límites durante la configuración.

## PDF semanal por correo

Contenido: período y zona horaria, ventas, costo vendido, ganancias estimadas, gastos, comparación con la semana anterior, productos destacados, productos estancados, stock crítico, cobertura, próximos vencimientos y recomendaciones relevantes.

Make ejecutará la consulta y generación programadas. El modelo puede redactar una síntesis; las tablas y totales provienen del sistema. Definir con el usuario día/hora de envío antes de activar la automatización. Guardar registro de envío y prevenir duplicados de la misma semana.

## Pendientes de definición

Número autorizado y correo; modelo de OpenAI y presupuesto; frecuencia de alertas; día/hora del reporte; meta de margen; ventana para productos estancados; configuración YCloud/Make y proveedor de correo. No se activa ninguna automatización en esta entrega.
