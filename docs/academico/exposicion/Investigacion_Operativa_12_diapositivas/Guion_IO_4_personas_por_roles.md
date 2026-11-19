# Guion de exposición por roles: Investigación Operativa II

**12 diapositivas · 8 minutos sugeridos.** Usar la presentación `NutriGalletas_IO_12_diapositivas_por_roles.pptx`, cuyo orden y notas coinciden con este guion. Los tiempos incluyen alternar entre diapositiva, sistema y código. Ensayar sin añadir una demostración extra al final.

| Integrante | Rol que representa | Diapositivas | Tiempo |
| --- | --- | --- | --- |
| Persona 1 | Almacén, compras y modelos IO | 1–5 | 0:00–2:50 |
| Persona 2 | Cajero: ventas y cobro | 6–7 | 2:50–4:00 |
| Persona 3 | Cajero: pedidos y pagos de recogida | 8–9 | 4:00–5:30 |
| Persona 4 | Administrador, IA y WhatsApp | 10–12 | 5:30–8:00 |

La Persona 4 explica administración a grandes rasgos y dedica más tiempo a IA/WhatsApp. Persona 1 expone los modelos de la materia, sin afirmar que almacén puede editar parámetros reservados al administrador. El reparto es de exposición, no de autoría de los módulos.

## Diapositiva 1. NutriGalletas

**Persona 1 · 0:00–0:20 · 20 segundos**

**Qué decir**

Buenos días. Presentamos NutriGalletas, una tienda que compra galletas terminadas y las vende por paquetes. Mostraremos el sistema y las reglas de Investigación Operativa que ayudan a decidir cuándo y cuánto comprar. Los ejemplos numéricos de la exposición son ficticios.

**Qué mostrar:** Portada y menú del sistema. Tener preparada la sesión autorizada y las ventanas de código.

**Dónde está la lógica:** `src/investigacion-operativa/plan-inventario.js`. Las rutas parten de la raíz del proyecto.

## Diapositiva 2. Inventario por lotes

**Persona 1 · 0:20–0:50 · 30 segundos**

**Qué decir**

En Inventario vemos cada lote con cantidad disponible, costo y vencimiento. Separamos los productos vencidos y los paquetes reservados para no ofrecerlos como stock libre. La regla FEFO utiliza primero el lote apto que vence antes. Así controlamos la caducidad y conservamos la trazabilidad de cada paquete vendido.

**Qué mostrar:** Inventario: señalar lote, vencimiento, reservado y filtros Por vencer/Vencidos.

**Dónde está la lógica:** `src/domain/operations.js: saleLots; src/domain/domain.js: availableStock`. Las rutas parten de la raíz del proyecto.

## Diapositiva 3. Compra recibida y nuevo costo

**Persona 1 · 0:50–1:25 · 35 segundos**

**Qué decir**

Cuando recibimos mercadería registramos proveedor, producto, cantidad, costo unitario, lote y vencimiento. La recepción suma stock y puede actualizar el precio de venta del catálogo. La sugerencia aplica un porcentaje editable sobre el costo: con costo de cinco bolivianos y recargo del treinta y tres por ciento, propone seis con sesenta y cinco. Las ventas anteriores conservan sus importes y costos históricos.

**Qué mostrar:** Compras: formulario y sección Precio de venta y ganancia. Señalar la casilla de actualización sin guardar una compra de ejemplo.

**Dónde está la lógica:** `src/features/compras/precio-sugerido.js; src/domain/domain.js: registerPurchase; SQL 011: recepción y precio`. Las rutas parten de la raíz del proyecto.

## Diapositiva 4. Cuándo reponer

**Persona 1 · 1:25–2:10 · 45 segundos**

**Qué decir**

En Comprar a tiempo, el sistema estima la demanda diaria con días completos, incluidos los días sin ventas. También calcula la desviación muestral. El punto de pedido es demanda diaria por plazo de entrega, más stock de seguridad. Esa reserva puede ser manual o estadística: z por desviación por raíz del plazo. Se compara el punto de pedido con stock libre más unidades en camino. La cobertura usa solamente stock libre. Los ajustes requieren permiso de administrador; almacén consulta la recomendación. No se envía una compra automáticamente.

**Qué mostrar:** Comprar a tiempo: señalar demanda, mínimo, disponibles y cobertura. Abrir demanda.js y reposicion.js. No guardar parámetros. Si se muestran ajustes restringidos, el administrador comparte su pantalla.

**Dónde está la lógica:** `src/investigacion-operativa/demanda.js: demandStatistics; reposicion.js: safetyStock, reorderPoint, stockCoverage`. Las rutas parten de la raíz del proyecto.

## Diapositiva 5. Cuánto comprar: EOQ y restricciones

**Persona 1 · 2:10–2:50 · 40 segundos**

**Qué decir**

Para la cantidad usamos EOQ: raíz de dos por demanda anual por costo del pedido, dividido entre mantenimiento anual por paquete. Comparamos piso y techo para elegir paquetes enteros con menor costo anual. En el ejemplo obtenemos ciento setenta y uno. Luego limitamos por capacidad y venta esperada durante la vida útil. Si solo caben cuarenta, la sugerencia no supera cuarenta. EOQ supone demanda estable; estas restricciones son aproximaciones prácticas y no garantizan eliminar faltantes o mermas.

**Qué mostrar:** Código: eoq.js y orderLimits en reposicion.js. Mantener visible la recomendación. Ejemplo base: D1460, S20, H2, SS6, stock10. Restricción alternativa: capacidad50, por tanto espacio40.

**Dónde está la lógica:** `src/investigacion-operativa/eoq.js: economicOrderQuantity, annualInventoryCost; reposicion.js: orderLimits`. Las rutas parten de la raíz del proyecto.

## Diapositiva 6. Venta y salida de stock

**Persona 2 · 2:50–3:25 · 35 segundos**

**Qué decir**

El cajero selecciona producto y cantidad; el sistema comprueba el precio vigente y las existencias libres. El servidor registra la venta y asigna lotes FEFO dentro de una transacción. Si falla una validación, evita guardar una venta incompleta. Las reservas de otros clientes no están disponibles para esta operación. El comprobante conserva el precio cobrado y permite rastrear la salida de los lotes.

**Qué mostrar:** Ventas: lista y un comprobante existente. Mostrar Nueva venta sin registrar una operación improvisada.

**Dónde está la lógica:** `src/domain/domain.js: registerSale; src/domain/operations.js: saleLots; supabase/migrations/004_observaciones_docente.sql: registrar_venta_cobro`. Las rutas parten de la raíz del proyecto.

## Diapositiva 7. Cobro, validación y vuelto

**Persona 2 · 3:25–4:00 · 35 segundos**

**Qué decir**

En efectivo registramos cuánto recibe el cajero. Si el total es doce y recibe veinte, el vuelto es ocho bolivianos. Un importe insuficiente impide confirmar. En pago QR el personal debe corroborar el abono real antes de marcar la confirmación correspondiente. El comprobante es de control interno. Los permisos del servidor evitan que ocultar un botón sea la única protección de una venta.

**Qué mostrar:** Pantalla de venta y campos de pago. Abrir cashSettlement. Explicar el ejemplo sin ingresar ni guardar un pago ficticio.

**Dónde está la lógica:** `src/domain/operations.js: cashSettlement; src/features/ventas/pagos.js`. Las rutas parten de la raíz del proyecto.

## Diapositiva 8. Solicitud de WhatsApp y reserva

**Persona 3 · 4:00–4:45 · 45 segundos**

**Qué decir**

El cliente elige productos, cantidad, nombre y fecha de recogida. CONFIRMAR envía la solicitud a la web. El cajero o administrador revisa y aprueba durante el horario de atención. En ese momento el servidor reserva los paquetes libres y envía el QR. El cliente tiene diez minutos para enviar comprobante. Si llega a tiempo, la reserva se conserva durante la revisión; si no llega, vence y se libera. Esta coordinación evita ofrecer las mismas unidades a dos compradores.

**Qué mostrar:** Pedidos para recoger: señalar estados y fecha/hora. Usar un pedido existente, sin aprobar ni alterar pedidos para la exposición.

**Dónde está la lógica:** `src/features/pedidos/recogida.js; supabase/migrations/008_pedidos_recogida.sql`. Las rutas parten de la raíz del proyecto.

## Diapositiva 9. Comprobante y revisión bancaria

**Persona 3 · 4:45–5:30 · 45 segundos**

**Qué decir**

La IA lee importe y moneda, y el servidor los compara con el total. Si debía veintiuno y el comprobante muestra veinte, solicita completar un boliviano. Si hay un exceso, requiere atención del personal para resolver el cambio. Una imagen no demuestra el ingreso bancario: el cajero o administrador verifica el abono y confirma el importe real. Después se registra la venta y el pedido avanza a preparación y entrega. Los comprobantes repetidos no deben sumar dos veces.

**Qué mostrar:** Pedidos para recoger: revisión de comprobante y casilla bancaria. No mostrar datos privados del cliente ni abrir el banco. Explicar el ejemplo con cifras ficticias.

**Dónde está la lógica:** `supabase/functions/nutri-ai/whatsapp/lectura-comprobante.mjs; supabase/migrations/010_control_comprobantes.sql`. Las rutas parten de la raíz del proyecto.

## Diapositiva 10. Administración a grandes rasgos

**Persona 4 · 5:30–6:00 · 30 segundos**

**Qué decir**

El administrador supervisa el negocio y administra las configuraciones y los accesos que le corresponden. En Resumen consulta ventas, costo histórico vendido y ganancia bruta. Esta última es ventas menos costo de los productos vendidos; no representa ganancia neta porque ya retiramos el registro de gastos. No recorreremos todas las pantallas administrativas. Nos centraremos en cómo el asistente utiliza la información autorizada.

**Qué mostrar:** Resumen: señalar los tres indicadores y el período. Mantener la explicación administrativa breve.

**Dónde está la lógica:** `src/domain/domain.js: financialSummary y PERMISSIONS; src/services/supabase.js`. Las rutas parten de la raíz del proyecto.

## Diapositiva 11. IA, WhatsApp y atención humana

**Persona 4 · 6:00–7:15 · 75 segundos**

**Qué decir**

La web se publica en Netlify y consulta datos de Supabase. En WhatsApp, YCloud recibe los mensajes y entrega respuestas; Make participa en la integración. La función nutri-ai verifica el evento, identifica si escribe el administrador o un cliente y llama al modelo de OpenAI. El modelo interpreta y redacta, pero las funciones y SQL validan permisos y operaciones. Una consulta como qué debo reponer usa datos autorizados y los modelos de EOQ y restricciones del proyecto; la IA no inventa las cifras. Los prompts del administrador y del cliente están separados. Cuando alguien pide atención humana aparece en la bandeja de WhatsApp. Podemos pausar solo esa conversación, responder desde YCloud y reanudar la IA al terminar. Los secretos viven en el entorno privado del servidor, no en el navegador. Las plantillas pagadas fuera de las veinticuatro horas siguen desactivadas.

**Qué mostrar:** Asistente: sugerencias de consulta. Luego Atención de WhatsApp: enlace a YCloud y botones de pausa/reanudación. Mostrar código sin ejecutar consultas, mensajes ni cambiar pausas durante la preparación.

**Dónde está la lógica:** `supabase/functions/nutri-ai/index.ts; ia/prompts/; investigacion-operativa/recomendacion.mjs; src/features/whatsapp/atencion-humana.js`. Las rutas parten de la raíz del proyecto.

## Diapositiva 12. Cierre técnico

**Persona 4 · 7:15–8:00 · 45 segundos**

**Qué decir**

El recorrido conecta inventario y ventas con una decisión de reposición. Los modelos de Investigación Operativa calculan demanda, seguridad, punto de pedido, EOQ y límites. La IA reutiliza esos cálculos para explicarlos y apoyar la atención. Las transacciones y los permisos de Supabase protegen reservas y registros. La recomendación no sustituye una compra autorizada ni la lectura del comprobante sustituye la revisión bancaria. La estructura del proyecto permite localizar cada responsabilidad y explicar cómo se obtiene el resultado. La validación funcional final la realizará el equipo. Gracias.

**Qué mostrar:** Volver a Comprar a tiempo o mantener el cierre. Si preguntan por código, abrir la guía técnica. No afirmar ahorros medidos ni validación funcional completa.

**Dónde está la lógica:** `docs/arquitectura/GUIA_TECNICA_EXPOSICION.md`. Las rutas parten de la raíz del proyecto.

## Preparación y preguntas de defensa

- Abrir previamente las pantallas y los archivos señalados. Usar una sesión autorizada para cada pantalla; un cajero no obtiene permisos de planificación por explicarla en una exposición.
- La presentación contiene capturas de demostración y ejemplos ficticios. Las credenciales, comprobantes privados y datos bancarios no se muestran.
- No registrar ventas, compras ni pagos improvisados para narrar un ejemplo. Este guion y su preparación no ejecutan pruebas del sistema.
- EOQ: D en paquetes/año, S en Bs/pedido y H en Bs/paquete/año. El costo del producto no es H. Costo anual relevante: DS/Q + (Q/2 + SS)H.
- Ejemplo: D1460, S20, H2, d4, L3, SS6, stock10, tránsito0, capacidad300, vida útil60. EOQ171, punto18, cobertura2,5 y cantidad práctica171. Con capacidad50, quedan40 espacios. Son supuestos ficticios.
- La seguridad estadística supone demanda diaria independiente, plazo constante y aproximación normal. El nivel de servicio es un objetivo, no una garantía observada.
- La cobertura no incluye tránsito. El sistema no compra al proveedor automáticamente ni optimiza de forma dinámica todos los lotes perecederos.
- La imagen de pago no confirma el banco. Un cajero o administrador verifica el abono real; si hay exceso, el reembolso sigue requiriendo atención humana.
- El plazo de diez minutos empieza con la aprobación del personal. Un comprobante recibido a tiempo detiene el vencimiento durante la revisión.
- Si preguntan por tres niveles CEO/IT/usuario común, aclarar que esa separación permanece pendiente. Los perfiles actuales son administrador, cajero y almacén.
- No afirmar entregas de correo, ahorros reales ni validación completa que el equipo todavía no haya comprobado.
