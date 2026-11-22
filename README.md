# NutriGalletas

Sistema de administración de una tienda de galletas terminadas, con planificación de inventario para Investigación Operativa II y asistencia por web y WhatsApp.

**Para exponer:** abrir primero [Guía técnica de exposición](docs/arquitectura/GUIA_TECNICA_EXPOSICION.md). Relaciona cada pantalla con sus funciones, fórmulas y reglas SQL.

## Estructura del proyecto

```text
PROYECTO/
├── index.html                     Entrada de la web
├── src/                           Código que llega al navegador
│   ├── app.js                     Navegación y coordinación general
│   ├── configuracion/publica.js   URL, clave publicable y modo demo/real
│   ├── investigacion-operativa/   Cálculos de la materia, separados del HTML
│   │   ├── parametros.js         Valores, unidades y validaciones
│   │   ├── demanda.js            Ventas por día, promedio y desviación
│   │   ├── eoq.js                Cantidad económica y función de costo
│   │   ├── reposicion.js         Reserva, punto de pedido, cobertura y límites
│   │   └── plan-inventario.js    Coordinador que integra los modelos
│   ├── domain/                    Reglas de ventas, compras, stock y permisos
│   ├── features/                  Pantallas y funciones por área
│   │   ├── compras/              Precio sugerido y ganancia por paquete
│   │   ├── inventario/           Pantalla de planificación
│   │   ├── ventas/               Pago y QR en la web
│   │   ├── pedidos/              Pedidos para recoger
│   │   ├── ia/                   Asistente de la web
│   │   └── whatsapp/             Bandeja de atención humana
│   ├── services/                  Sesión, consultas a Supabase e imágenes
│   ├── data/                      Datos ficticios y almacenamiento demo
│   ├── ui/                        Elementos visuales compartidos
│   ├── styles/                    CSS base, tema y asistente
│   └── assets/                    Imágenes del catálogo y QR de cobro
├── supabase/                      Base de datos y servicios del servidor
│   ├── README.md                  Índice de reglas SQL y despliegue
│   ├── migrations/               Historial SQL numerado, sin reordenar
│   ├── seeds/                    Datos ficticios, separados del esquema
│   ├── functions/
│   │   ├── nutri-ai/
│   │   │   ├── index.ts          Entrada HTTP y coordinación de canales
│   │   │   ├── ia/               Asistente admin, cliente y prompts
│   │   │   ├── investigacion-operativa/ Adaptador a los modelos compartidos
│   │   │   ├── whatsapp/         Horarios y lectura de comprobantes
│   │   │   ├── seguridad/        Firmas de eventos y pruebas de autenticidad
│   │   │   ├── respuestas/       Formato legible de las respuestas
│   │   │   ├── compartido/       Fechas, borradores y reportes
│   │   │   └── configuracion/    Lectura de variables privadas del entorno
│   │   └── otras funciones       Acceso y correos
│   └── config.toml               Configuración de funciones
├── scripts/                       Servidor local y empaquetado
├── tests/                         Pruebas existentes: unit, integration y manual
└── docs/
    ├── arquitectura/              Guía técnica, modelo relacional e inventarios
    ├── configuracion/             Credenciales, Supabase y publicación
    ├── ia/                        IA, WhatsApp, horarios y comprobantes
    └── academico/                 Informes, sprints y presentaciones
```

`node_modules/` contiene dependencias instaladas. `dist/` es una copia generada para publicar. No se editan ni se guardan en Git. `supabase/functions/nutri-ai/index.ts` mantiene su nombre porque es el punto de entrada del servicio, aunque su lógica esté repartida en subcarpetas.

## Dónde encontrar cada función

| Quiero explicar o cambiar…               | Abrir                                                        |
| ---------------------------------------- | ------------------------------------------------------------ |
| EOQ y costo anual de inventario          | `src/investigacion-operativa/eoq.js`                         |
| Demanda, promedio y desviación muestral  | `src/investigacion-operativa/demanda.js`                     |
| Reserva, punto de pedido y cobertura     | `src/investigacion-operativa/reposicion.js`                  |
| Capacidad y vida útil                    | `orderLimits` en `src/investigacion-operativa/reposicion.js` |
| Resultado completo y advertencias        | `src/investigacion-operativa/plan-inventario.js`             |
| Cómo se muestran esos cálculos           | `src/features/inventario/planificacion.js`                   |
| Reglas locales de venta y compra         | `src/domain/domain.js` y `src/domain/operations.js`          |
| Recomendación de precio de venta         | `src/features/compras/precio-sugerido.js`                    |
| Asistente de la web                      | `src/features/ia/asistente.js`                               |
| Instrucciones del modelo de IA           | `supabase/functions/nutri-ai/ia/prompts/`                    |
| Conversación del administrador o cliente | `supabase/functions/nutri-ai/ia/`                            |
| Hora de recogida y lectura de imágenes   | `supabase/functions/nutri-ai/whatsapp/`                      |
| Pausar, responder por YCloud y reanudar  | `src/features/whatsapp/atencion-humana.js`                   |
| Pedidos y revisión de abonos en web      | `src/features/pedidos/recogida.js`                           |
| Firmas de webhooks                       | `supabase/functions/nutri-ai/seguridad/firmas.mjs`           |
| Base de datos y transacciones            | [Índice SQL](supabase/README.md) y `supabase/migrations/`    |
| Ubicación de configuración y secretos    | [Credenciales](docs/configuracion/CREDENCIALES.md)           |

Los modelos puros EOQ y límites se reutilizan en la planificación y en el adaptador de la IA. Los cálculos agregados y las transacciones de producción siguen en SQL. El archivo de navegación conserva formularios generales; esta separación no convierte toda la aplicación a un framework ni altera las reglas del negocio.

## Comandos

```sh
npm ci                 # Instalar dependencias de desarrollo fijadas
npm run dev            # Abrir el servidor local
npm run build          # Regenerar dist/ para Netlify
npm run format         # Dar formato al código
npm run format:check   # Revisar formato sin ejecutar operaciones
node scripts/build-ai-function.mjs  # Empaquetar IA y sus modelos compartidos
```

La función empaquetada se genera en `/tmp/nutrigalletas-ai/index.ts`. Incluye los modelos matemáticos que importa desde `src/`. Para el editor de Supabase se utiliza ese bundle completo, no solamente el punto de entrada fuente.

Prettier usa dos espacios, punto y coma y ancho objetivo de 90 caracteres. Las plantillas HTML incrustadas llevan `/* HTML */`. URLs, SVG y otras cadenas indivisibles pueden superar ese ancho.

## Pruebas y publicación

Se mantienen las pruebas existentes y se actualizan sus imports. El propietario ejecutará las pruebas funcionales cuando corresponda:

```sh
npm test
npm run test:db
npm run test:inventory:db
npm run test:observations:db
```

Las páginas de `tests/manual/` pueden realizar operaciones según sus controles y no se publican. [VALIDACIONES.md](docs/VALIDACIONES.md) conserva verificaciones históricas, no una garantía del estado actual. Los PDF, DOCX y PPTX anteriores pueden conservar rutas históricas; la guía técnica contiene las rutas actuales.

Netlify publica únicamente `index.html` y `src/`, preparados por `scripts/build.mjs`. SQL, documentos y código de servidor no forman parte del sitio público. Reorganizar archivos locales no despliega automáticamente cambios en Supabase, GitHub ni Netlify. No volver a ejecutar las migraciones ni cargar semillas sobre producción por este cambio de carpetas.

## Documentación

- [Auditoría de todos los usuarios y descarga de .log](docs/arquitectura/AUDITORIA.md).

- [Guía técnica para exponer](docs/arquitectura/GUIA_TECNICA_EXPOSICION.md).
- [Modelos de inventario](docs/arquitectura/MODELOS_INVENTARIO.md).
- [Modelo relacional](docs/arquitectura/MODELO_RELACIONAL.md).
- [Alcance y sprints](docs/academico/ALCANCE_Y_SPRINTS.md).
- [Observaciones del docente](docs/academico/OBSERVACIONES_DOCENTE.md).
- [Configuración de Supabase](docs/configuracion/CONFIGURAR_SUPABASE.md).
- [Publicación en GitHub y Netlify](docs/configuracion/GITHUB_NETLIFY.md).
- [IA y WhatsApp](docs/ia/IMPLEMENTACION.md).
- [Credenciales y configuración](docs/configuracion/CREDENCIALES.md).
- [Stock mínimo automático y plazo del proveedor](docs/configuracion/STOCK_MINIMO_AUTOMATICO.md).

Las claves privadas permanecen en los servicios correspondientes, fuera del navegador y del repositorio. El QR conserva su ruta `src/assets/qr-ganadero.png`. Los roles existentes siguen siendo administrador, cajero y almacén. CEO/IT/usuario común permanece pendiente. No hay delivery, fabricación ni facturación fiscal.
