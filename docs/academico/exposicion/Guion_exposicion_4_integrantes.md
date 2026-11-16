# Guion de exposición del avance de NutriGalletas

Duración objetivo: 4 minutos y 30 segundos. Reserva: 30 segundos para cambios de expositor y pausas. Una diapositiva por persona. Ensayar con cronómetro, sin leer las diapositivas palabra por palabra.

## 1. Maycol Norbert Lopez Huallpara (0:00–1:00)

Diapositiva 1: Objetivo, alcance y perfiles.

Buenos días. Nuestro proyecto se llama NutriGalletas y busca organizar las ventas y el inventario de una tienda de galletas nutritivas. Lo desarrollamos para Programación III e Investigación Operativa II, utilizando datos ficticios coherentes con La Paz y montos en bolivianos.

El objetivo del primer sprint era preparar la estructura, los usuarios y los productos. Para este avance también desarrollamos funciones del segundo sprint y la parte administrativa del tercero.

Definimos tres perfiles: el administrador tiene acceso completo, el cajero registra ventas y consulta únicamente las suyas, y el encargado de almacén gestiona productos, proveedores, compras y lotes. Actualmente estas funciones se pueden probar en modo demostración.

## 2. Jhissel Aracely Suarez Suxo (1:00–2:10)

Diapositiva 2: Funciones añadidas y circuito de operación.

En la parte funcional añadimos ocho módulos: usuarios, categorías, productos, proveedores, compras, lotes de inventario, ventas y gastos.

El proceso comienza cuando almacén registra una compra recibida. El sistema guarda la cantidad, el costo y la fecha de vencimiento del lote. Después, al registrar una venta, calcula el total y descuenta las existencias. También impide vender más de lo disponible y utiliza primero los lotes que vencen antes, excluyendo los vencidos.

Cada venta genera un comprobante interno que puede imprimirse o guardarse como PDF. Además, mostramos avisos de stock mínimo y de lotes que vencerán en quince días o menos. En esta fase son controles administrativos, sin predicción ni mensajes automáticos.

## 3. Isaura Fernandez Herrera (2:10–3:20)

Diapositiva 3: Cómo lo construimos y qué probamos.

Construimos la interfaz con HTML, CSS y JavaScript, separando las pantallas de las reglas del negocio. Por ahora, la demostración guarda los datos en el navegador. También preparamos el modelo relacional, las funciones de compras y ventas y los permisos que utilizaremos en Supabase.

El dashboard permite consultar ingresos, costo de los productos vendidos, gastos y resultado neto estimado por fechas. Conservamos el costo histórico de cada venta para que los cambios posteriores no alteren ese resultado.

La validación registrada incluye seis pruebas de lógica y diecinueve comprobaciones en PostgreSQL local. También probamos en pantalla una venta, su comprobante, el historial del cajero y la recepción de una compra.

## 4. Rebeca Nancy Yana Corina (3:20–4:30)

Diapositiva 4: Pendientes y cuatro sprints.

El siguiente paso es crear y conectar Supabase. Allí debemos comprobar el inicio de sesión real, la creación de cuentas por el administrador, la recuperación, el bloqueo por intentos fallidos y la actualización entre usuarios.

Después completaremos el tercer sprint con EOQ, punto de pedido, clasificación ABC y estimación de días de inventario. En el cuarto incorporaremos la IA mediante Make, YCloud y OpenAI: solo el administrador consultará por WhatsApp, recibirá alertas y un reporte semanal en PDF por correo.

Finalmente subiremos el proyecto a GitHub y lo desplegaremos en Netlify. Este incremento muestra el circuito administrativo funcionando en demostración, con la integración en la nube todavía pendiente.

## Preparación rápida

- Mostrar las cuatro diapositivas. Si no exigen demostración, evitar navegar por todos los módulos dentro de los cinco minutos.
- Si requieren una demostración, sustituir parte de la intervención de Jhissel por 20–25 segundos: elegir una galleta, registrar la venta y abrir el comprobante. No agregar ese tiempo al final. Dejar la aplicación abierta y los datos preparados antes de empezar.
- No afirmar que Supabase ya funciona ni que la seguridad online está terminada. Hay código y modelo preparados, con validación SQL local.
- No afirmar un porcentaje exacto como 75 %. El avance comprende los sprints 1 y 2 y la parte administrativa del 3, con integración pendiente.
- La IA, EOQ y las automatizaciones todavía no están implementadas. El objetivo del avance actual es administrativo.
- Los nombres asignan turnos de exposición, no autoría individual de cada módulo.

## Respuestas breves por si preguntan

**¿Qué cambia al registrar una venta?** Se guarda el detalle, se conserva el precio y costo histórico, se descuenta el inventario y se genera un comprobante interno.

**¿La base de datos ya está online?** Aún no. El modelo y las funciones están preparados y se probaron en PostgreSQL local. El siguiente paso es crear y conectar Supabase.

**¿Dónde está la IA?** Corresponde al sprint 4. Consultará información y enviará alertas al número autorizado del administrador.

**¿Qué aporta Investigación Operativa II?** En el sprint 3 incorporaremos EOQ para recomendar cuánto comprar y el punto de pedido para apoyar cuándo reponer.

**¿Cuántas tablas principales tiene?** Ocho entidades principales más tablas de detalle, movimientos y seguridad. La interpretación docente de «tablas madre» aún debe validarse.
