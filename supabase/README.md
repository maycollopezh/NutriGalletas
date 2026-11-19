# Base de datos y servicios del servidor

## Dónde está cada parte

- `migrations/`: historial SQL ordenado. Se conserva su numeración y contenido.
- `seeds/`: datos ficticios, separados del esquema y de producción.
- `functions/`: funciones del servidor. `nutri-ai/index.ts` coordina IA y WhatsApp.
- `config.toml`: configuración del entorno de funciones.

## Índice SQL para encontrar la lógica

| Archivo                                  | Lógica principal                                                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `001_schema.sql`                         | Tablas base, usuarios, permisos, ventas, compras y lotes.                                                        |
| `003_inventarios_iop.sql`                | Parámetros IO, demanda histórica agregada, RLS y tránsito al recibir compras.                                    |
| `004_observaciones_docente.sql`          | Cobro de ventas y primera consulta del resumen de inventario.                                                    |
| `005_imagenes_catalogo.sql`              | Imágenes y almacenamiento del catálogo.                                                                          |
| `006_asistente_ia.sql`                   | Servicio administrativo de IA, consultas, propuestas y confirmación de operaciones.                              |
| `007_atencion_publica_whatsapp.sql`      | Atención pública y solicitudes de clientes.                                                                      |
| `008_pedidos_recogida.sql`               | Pedidos, reserva de lotes y resumen de inventario que descuenta reservas. Buscar `consultar_resumen_inventario`. |
| `009_bandeja_atencion_whatsapp.sql`      | Bandeja y pausa/reanudación individual.                                                                          |
| `010_control_comprobantes.sql`           | Importes, pagos parciales, duplicados y revisión bancaria.                                                       |
| `011_precios_compra_y_retiro_gastos.sql` | Recepción con precio opcional, trazabilidad y retiro de escrituras en Gastos.                                    |

Las migraciones posteriores pueden reemplazar funciones anteriores. Mantenerlas intactas evita alterar el historial de instalación y las dependencias entre incrementos. Este índice no es un nuevo script para ejecutar. No volver a aplicar todas las migraciones ni cargar semillas en una base ya instalada por haber reorganizado el proyecto.

## Modelos IO y producción

`consultar_demanda_inventario` agrega las ventas. La definición posterior de `consultar_resumen_inventario` calcula en SQL demanda, reserva, mínimo y stock libre respetando los permisos. Los modelos JavaScript de `src/investigacion-operativa/` completan planificación, EOQ, costos y límites; el asistente reutiliza esos cálculos mediante su adaptador. La base de datos sigue siendo la autoridad para reservas, cobros y escrituras.

Para encontrar la última definición de una función en VS Code: buscar su nombre en `migrations/` y revisar el archivo de mayor número que la redefine. No deducir el esquema actual contando solo las tablas de `001_schema.sql`.

## Despliegue de IA

El servicio importa modelos puros del proyecto. Preparar con `node scripts/build-ai-function.mjs` para incluirlos en un único archivo. El bundle generado no contiene valores de credenciales, que siguen en Secrets. No publicar las migraciones ni las funciones completas como parte del sitio público de Netlify.
