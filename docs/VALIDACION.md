# Validación de esta entrega

## Pruebas de reglas de negocio

`npm test`: seis pruebas automatizadas del modo de demostración. Comprueban consumo por vencimiento, conservación de precio/costo, rechazo de sobreventa con líneas repetidas, rechazo de cantidades inválidas, exclusión de vencidos, permisos, recepción de compra y resultado neto con fechas locales.

## PostgreSQL local

`tests/sql-validation.mjs` ejecuta el esquema SQL y la carga de ejemplo en PGlite, un PostgreSQL local. Simula únicamente las funciones de identidad `auth.uid()` / `auth.jwt()` y usuarios de Auth, para evaluar las políticas. No simula ni demuestra la entrega real de correo o la autenticación remota.

Instala la dependencia de desarrollo y ejecuta:

```sh
npm install
npm run test:db
```

También se puede pasar `PGLITE_MODULE_PATH` como URL de un módulo instalado temporalmente. No hace falta esta dependencia para abrir la demostración.

Resultado verificado durante el desarrollo: **19 comprobaciones correctas**:

- Saldos ficticios reconciliados con movimientos.
- Precio, costo y descuento correctos en venta SQL.
- Rechazo de cantidades fraccionarias y sobreventa por productos duplicados.
- Venta fallida sin registros parciales.
- Cajero solo ve sus ventas y no obtiene proveedores/costos de inventario.
- Consulta de cantidades permitida sin revelar costos.
- Sin modificación directa de saldos ni ascenso del propio rol.
- Almacén sin acceso a ventas ni permiso para registrarlas.
- Recepción de compra con total correcto.
- JWT sin sesión autorizada rechazado por las políticas.
- Bloqueo tras cinco fallos y rechazo de datos durante el bloqueo.
- Autorización de recuperación de un solo uso.

## Verificación de código y publicación

Sintaxis revisada para los módulos JavaScript y las dos funciones TypeScript. El empaquetado para Netlify debe contener únicamente interfaz y configuración pública.

## Pruebas de interfaz

Verificado en el navegador integrado, con la interfaz adaptable a una ventana estrecha:

- Dashboard: ingresos, costos, gastos, resultado y gráfico legibles.
- Administrador: venta de un paquete de avena por Bs 6; comprobante interno #0022 generado; stock de 12 a 11.
- Cajero Jhissel: historial con cuatro ventas propias dentro del período, sin la venta #0022 del administrador ni las de la segunda cajera.
- Almacén: recepción de diez paquetes de avena por Bs 3,50 cada uno; compra por Bs 35 y lote nuevo con diez unidades.
- Inventario: lote recibido visible, producto fuera del mínimo tras la recepción, un lote próximo a vencer y un lote vencido separado.

Las operaciones de esta revisión son ficticias y solo modificaron datos de demostración del navegador. No se probaron todavía envío de correo, impresión física, integración Supabase ni el proveedor de IA. No se presenta una revisión en una ventana estrecha como prueba exhaustiva de todos los tamaños.

## Pendientes reales

Crear/conectar Supabase; ejecutar el esquema sobre el proyecto; desplegar funciones; configurar y probar correo; probar usuarios reales, revocación, recuperación, Realtime y concurrencia entre dos sesiones. GitHub y Netlify permanecen pendientes para el despliegue final. La IA y los modelos de IO aún no están implementados.

No se afirma certificación de seguridad ni cumplimiento automático de un porcentaje académico. Los criterios de evaluación y la interpretación de «tablas madre» los valida la docente.
