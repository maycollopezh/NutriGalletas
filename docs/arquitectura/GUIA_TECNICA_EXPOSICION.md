# Guía técnica para exponer NutriGalletas

## Por dónde empezar

1. Abrir **Comprar a tiempo** en el sistema.
2. Abrir `src/investigacion-operativa/plan-inventario.js` en VS Code.
3. Seguir las llamadas a demanda, reserva, EOQ y límites. Los archivos matemáticos no contienen HTML, prompts ni credenciales.
4. Para explicar la información real de producción, mostrar también la consulta SQL de inventario y la conexión `src/services/supabase.js`.

No confundir el cálculo de una recomendación con enviar una compra al proveedor. El sistema recomienda y el usuario decide. Los ejemplos académicos son ficticios. Esta reorganización no ejecutó pruebas funcionales ni modificó la base de producción.

## Investigación Operativa: archivo por modelo

| Qué explicar              | Archivo desde la raíz                                                   | Función y lógica                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Parámetros y unidades     | `src/investigacion-operativa/parametros.js`                             | `inventoryDefaults`, `validateInventoryParameters`, tabla `Z`. D, S, H, plazo, seguridad, capacidad y vida útil. |
| Ventas por día            | `src/investigacion-operativa/demanda.js`                                | `aggregateDailySales`: agrupa cantidades por producto y día de Bolivia.                                          |
| Promedio y variabilidad   | `src/investigacion-operativa/demanda.js`                                | `demandStatistics`: promedio y desviación muestral sobre N días completos, incluidos ceros. Excluye hoy.         |
| Cantidad económica        | `src/investigacion-operativa/eoq.js`                                    | `economicOrderQuantity`: Q\* = raíz(2DS/H), compara piso y techo.                                                |
| Función objetivo          | `src/investigacion-operativa/eoq.js`                                    | `annualInventoryCost`: DS/Q + (Q/2 + SS)H.                                                                       |
| Stock de seguridad        | `src/investigacion-operativa/reposicion.js`                             | `safetyStock`: manual o techo(z × desviación × raíz(L)).                                                         |
| Cuándo pedir              | `src/investigacion-operativa/reposicion.js`                             | `reorderPoint`: techo(dL + SS). Se compara con stock libre más tránsito.                                         |
| Días de cobertura         | `src/investigacion-operativa/reposicion.js`                             | `stockCoverage`: stock libre/d. El coordinador descarta demanda cero antes de calcular.                          |
| Capacidad y perecibilidad | `src/investigacion-operativa/reposicion.js`                             | `orderLimits`: mínimo entre EOQ, capacidad libre y demanda durante vida útil, sin cantidades negativas.          |
| Plan completo             | `src/investigacion-operativa/plan-inventario.js`                        | `inventoryPlan`: valida, llama a modelos, evita estimaciones sin demanda y añade advertencias.                   |
| Presentación en pantalla  | `src/features/inventario/planificacion.js`                              | `planningView`, `planningForm`, `planningRows`: transforma resultados en HTML.                                   |
| Recomendación de la IA    | `supabase/functions/nutri-ai/investigacion-operativa/recomendacion.mjs` | `orderAdvice`: reutiliza los módulos EOQ y límites de `src/`. Solo adapta el resultado a texto.                  |

### Unidades y límites que deben mencionar

- D: paquetes/año. d: paquetes/día. S: Bs/pedido. H: Bs/paquete/año.
- SS y Q: paquetes. L y vida útil: días. El costo de comprar un paquete no equivale a H.
- EOQ supone demanda estable y reposición del modelo clásico. La seguridad estadística supone demanda diaria independiente, plazo constante y aproximación normal.
- Capacidad y vida útil son restricciones prácticas por producto. No hay optimización conjunta de almacén ni un modelo dinámico completo de perecederos.
- Cobertura es una estimación, no una fecha garantizada de agotamiento. El tránsito no es stock vendible.
- El coordinador mantiene las salidas anteriores: `daily`, `reorder`, `eoq`, `coverage`, `suggested`, `costAtEOQ`, `warnings`, etc.

### Ejemplo ficticio para seguir el código

D = 1460, S = 20, H = 2, d = 4, L = 3, SS = 6, stock libre = 10, tránsito = 0, capacidad = 300 y vida útil = 60.

EOQ continuo ≈ 170,88; EOQ entero = 171. Punto de pedido = 18. Posición = 10, por tanto corresponde reponer. Cobertura = 2,5 días. Capacidad libre = 290 y límite por vida útil = 230: cantidad práctica = 171. Costo anual relevante ≈ Bs353,76. Son cifras de un ejemplo, no resultados medidos de la tienda.

## Otras funciones del sistema

| Tema                                | Dónde abrir                                | Qué mostrar                                                                                                                             |
| ----------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Ventas, compras y costos históricos | `src/domain/domain.js`                     | `registerSale`, `registerPurchase`, `financialSummary`. Reglas locales de demostración. La producción confirma escrituras mediante SQL. |
| FEFO y vuelto                       | `src/domain/operations.js`                 | `saleLots`, `cashSettlement`. Asignación por vencimiento apto y cálculo del efectivo.                                                   |
| Sugerencia de precio                | `src/features/compras/precio-sugerido.js`  | Costo nuevo, porcentaje editable y actualización opcional. 33% sobre costo no es margen del 33% sobre ventas.                           |
| Pagos en pantalla                   | `src/features/ventas/pagos.js`             | Confirmación y QR de la venta web.                                                                                                      |
| Pedidos para recoger                | `src/features/pedidos/recogida.js`         | Solicitud, aprobación, comprobante y recogida según permisos.                                                                           |
| IA en la web                        | `src/features/ia/asistente.js`             | Pantalla y llamadas al servicio.                                                                                                        |
| Atención humana                     | `src/features/whatsapp/atencion-humana.js` | Bandeja, enlace a YCloud, pausa y reanudación por cliente.                                                                              |
| Acceso a datos                      | `src/services/supabase.js`                 | Sesión, consultas y RPC. Nunca presenta claves privadas.                                                                                |
| Navegación y formularios generales  | `src/app.js`                               | Coordinación de pantallas. Parte del HTML general sigue aquí.                                                                           |

## IA y WhatsApp: recorrido técnico

`supabase/functions/nutri-ai/index.ts` mantiene el punto de entrada que Supabase espera y coordina los canales. No contiene las fórmulas EOQ duplicadas.

| Carpeta dentro de `nutri-ai/`      | Responsabilidad                                                         |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `ia/asistente-admin.mjs`           | Conversación y operaciones autorizadas del administrador.               |
| `ia/asistente-cliente.mjs`         | Atención pública y preparación de solicitudes.                          |
| `ia/prompts/`                      | Instrucciones del modelo separadas del código del flujo.                |
| `investigacion-operativa/`         | Adaptador que conecta los modelos matemáticos con el texto de la IA.    |
| `whatsapp/horario-recogida.mjs`    | Interpretación de fechas y horas de recogida.                           |
| `whatsapp/lectura-comprobante.mjs` | Lectura de imágenes de comprobantes. No consulta el banco.              |
| `seguridad/firmas.mjs`             | Verificación de firmas y pruebas del webhook.                           |
| `respuestas/formato.mjs`           | Respuestas legibles y filtros de texto interno.                         |
| `compartido/operaciones.mjs`       | Utilidades de fechas, borradores, consultas e informe.                  |
| `configuracion/entorno.ts`         | Lectura de variables privadas mediante `Deno.env`. No almacena valores. |

Recorrido: WhatsApp entra por YCloud; el webhook verifica su autenticidad; Make y el servicio coordinan el procesamiento; el asistente interpreta; SQL aplica permisos y transacciones; YCloud entrega la respuesta. La imagen permite comparar un importe, pero admin o cajero verifica el abono real en el banco.

## Base de datos de producción

Los archivos SQL están ordenados en `supabase/migrations/`. Una función puede reemplazarse en una migración posterior: para exponer su comportamiento actual hay que mostrar la definición vigente, no solo la primera. El índice está en `supabase/README.md`.

No ejecutar migraciones, semillas ni consultas de escritura durante la exposición para demostrar dónde está el código. Las semillas de `supabase/seeds/` son datos ficticios separados de producción.

## Credenciales y publicación

- Configuración visible al navegador: `src/configuracion/publica.js`.
- Variables privadas: Secrets de Supabase y conexiones privadas de Make, YCloud y correo. Ver `docs/configuracion/CREDENCIALES.md`.
- `node scripts/build.mjs` prepara únicamente el sitio público en `dist/`.
- `node scripts/build-ai-function.mjs` empaqueta el servicio y los modelos que reutiliza en `/tmp/nutrigalletas-ai/index.ts`. Los imports de los modelos deben incluirse en este bundle al publicar el servicio; no pegar únicamente el `index.ts` fuente en el editor de Supabase.
- Reorganizar archivos locales no publica cambios por sí solo en GitHub, Netlify ni Supabase.

## Reparto por roles para una exposición técnica de 8 minutos

Usar `docs/academico/exposicion/Investigacion_Operativa_12_diapositivas/Guion_IO_4_personas_por_roles.md` y la presentación `NutriGalletas_IO_12_diapositivas_por_roles.pptx`.

| Integrante | Diapositivas | Rol y contenido | Tiempo |
| --- | --- | --- | --- |
| Persona 1 | 1–5 | Almacén, compras y modelos de Investigación Operativa | 0:00–2:50 |
| Persona 2 | 6–7 | Cajero: ventas, validación de cobro y vuelto | 2:50–4:00 |
| Persona 3 | 8–9 | Cajero: pedidos, comprobante y verificación bancaria | 4:00–5:30 |
| Persona 4 | 10–12 | Resumen administrativo breve, IA, WhatsApp y cierre | 5:30–8:00 |

El reparto no modifica los permisos del sistema ni atribuye autoría individual. Los ajustes restringidos los muestra una sesión de administrador. La Persona 4 explica administración a grandes rasgos y dedica más tiempo a WhatsApp. Los PDF y presentaciones anteriores pueden mencionar rutas antiguas; esta guía indica las rutas actuales.
