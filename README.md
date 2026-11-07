# NutriGalletas

Sistema administrativo de una tienda de galletas nutritivas de La Paz, Bolivia. Proyecto compartido entre Programación III e Investigación Operativa II, UNIFRANZ, gestión 2026.

## Abrir la aplicación

Necesitas Node.js. En esta carpeta ejecuta:

```sh
npm run dev
```

Abre http://127.0.0.1:4317. No se requiere instalar paquetes para la demostración. La interfaz usa HTML, CSS y JavaScript; las fuentes externas son opcionales y tienen alternativas locales.

## Estado de esta entrega

- Sprint 1: estructura, tres perfiles, usuarios y catálogo implementados en demostración; esquema y funciones de Supabase preparados.
- Sprint 2: compras recibidas, lotes, ventas, descuento de inventario y comprobantes internos implementados en demostración.
- Sprint 3: gastos, dashboard, EOQ, punto de pedido, reserva y cobertura implementados. Mínimo automático y demanda diaria conectados a la base de datos. ABC no forma parte de este avance.
- Sprint 4: IA, WhatsApp y PDF semanal por correo planificados, pendientes.

**Supabase está creado y conectado.** La migración 004 se aplicó al proyecto NutriGalletas el 6 de noviembre de 2026 y devolvió Success en el editor SQL. El modo de demostración permanece separado y guarda datos ficticios en este navegador. Gmail requiere la configuración de sus secretos y una comprobación real del envío.

El porcentaje de avance académico depende de la rúbrica de la docente. El alcance implementado va más allá de los dos primeros sprints, pero la base de datos online y la seguridad deben verificarse antes de presentar ese avance como integrado.

## Funciones disponibles

Ocho módulos principales: usuarios, categorías, productos, proveedores, compras, lotes/inventario, ventas y gastos. Dashboard con filtros de fechas, ingresos, costo histórico vendido, gastos y resultado neto estimado. Comprobantes imprimibles, también guardables como PDF desde el navegador.

Los datos de ejemplo son ficticios: precios en Bs, proveedores marcados como ficticios, direcciones de La Paz, pagos en efectivo, QR y tarjeta. La unidad de inventario es un paquete de 100 g. No hay delivery, producción, facturación fiscal ni acceso de clientes.

## Documentación

- [Alcance y cuatro sprints](docs/ALCANCE_Y_SPRINTS.md).
- [Modelo relacional para revisión docente](docs/MODELO_RELACIONAL.md).
- [Crear y configurar Supabase](docs/CONFIGURAR_SUPABASE.md).
- [Validación y pruebas](docs/VALIDACION.md).
- [Fase futura de IA](docs/IA_PLANIFICADA.md).
- [GitHub y Netlify](docs/GITHUB_NETLIFY.md).

## Pruebas

```sh
npm test
```

Las pruebas verifican reglas de venta, vencimientos, stock, costos históricos, permisos de demostración y balance. La validación SQL usa opcionalmente PGlite para ejecutar PostgreSQL localmente; está descrita en la documentación y no sustituye las pruebas finales sobre Supabase.

## Seguridad y configuración

En `src/config.js` solo van la URL de Supabase y su clave pública. Las claves de servicio, de OpenAI, YCloud y correo se guardan únicamente como secretos del servidor/Make. Las contraseñas no se almacenan en tablas de la aplicación ni en el repositorio.

La creación de cuentas, recuperación y límites de intentos están preparados en funciones de Supabase. El correo de una cuenta existente permanece fijo. Antes de usar datos reales hay que completar la configuración y las pruebas de permisos y recuperación.


## Observaciones de Investigación Operativa II

Cantidades y despacho por lote (FEFO), mínimos calculados automáticamente, demanda diaria, efectivo recibido/vuelto, permisos y recibos por correo: ver [detalle y activación](docs/OBSERVACIONES_DOCENTE.md). La fuente vigente del mínimo es el cálculo de planificación, no el campo manual histórico del producto.
# NutriGalletas
