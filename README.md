# NutriGalletas

Sistema web de ventas, inventario, planificación y atención por WhatsApp para una tienda de galletas de La Paz, Bolivia. Proyecto de Programación III e Investigación Operativa II.

## Empieza aquí

- Para abrir el sistema publicado: [NutriGalletas](https://nutrigalletas-lp.netlify.app/).
- Para trabajar con el código: abre esta carpeta completa en VS Code.
- Para ejecutar una copia local: `npm run dev` y abre `http://127.0.0.1:4317`.
- Para saber cómo funciona la IA: [implementación y límites](docs/ia/IMPLEMENTACION.md).
- Para configurar la base de datos: [guía de Supabase](docs/configuracion/CONFIGURAR_SUPABASE.md).

Node.js es necesario para los comandos. La interfaz usa HTML, CSS y JavaScript sin un framework ni una compilación obligatoria. `src/config.js` selecciona el modo conectado o la demostración con datos ficticios. Una copia local en modo conectado utiliza la misma base de datos que tenga configurada; no es un entorno de prueba aislado.

## Qué hay en cada carpeta

```text
PROYECTO/
├── index.html                 Página que abre el navegador
├── src/                       Aplicación que usa el personal
│   ├── app.js                 Inicio, navegación y coordinación de pantallas
│   ├── config.js              Configuración pública y modo de funcionamiento
│   ├── assets/                Fotografías y QR de cobro
│   ├── styles/                Estilos de la interfaz
│   ├── domain/                Reglas de ventas, stock e Investigación Operativa
│   ├── data/                  Datos y almacenamiento de demostración
│   ├── services/              Conexión con Supabase y carga de imágenes
│   ├── features/              Asistente, pedidos, atención y otras pantallas
│   └── ui/                    Componentes visuales compartidos
├── supabase/                  Todo lo que se ejecuta en el servidor
│   ├── migrations/           Cambios SQL numerados de estructura y reglas
│   ├── seeds/                Datos ficticios, separados de las migraciones
│   ├── functions/            Autenticación, correos y cerebro de la IA
│   └── config.toml           Configuración de funciones
├── scripts/                   Abrir localmente y preparar archivos de publicación
├── tests/                     Pruebas existentes, separadas por tipo
│   ├── unit/                 Reglas y módulos individuales
│   ├── integration/          Base de datos local y consultas de revisión
│   └── manual/               Páginas auxiliares para revisión manual
└── docs/                      Guías y material de las materias
    ├── academico/            Alcance, observaciones, informe y exposición
    ├── arquitectura/         Modelo de datos e inventarios
    ├── configuracion/        Supabase, imágenes y publicación
    ├── ia/                   Asistente, WhatsApp y automatizaciones
    └── VALIDACIONES.md       Registro histórico de verificaciones anteriores
```

`node_modules/` contiene dependencias instaladas y `dist/` es una copia generada para publicar. No se editan ni se guardan en Git. Los archivos de configuración que empiezan con punto mantienen el mismo formato y las exclusiones en todos los editores.

## Dónde cambiar cada cosa

| Necesidad | Archivo o carpeta |
| --- | --- |
| Navegación, inicio o coordinación general | `src/app.js` |
| Pantalla de pedidos para recoger | `src/features/orders.js` |
| Atención humana por cliente | `src/features/whatsapp-inbox.js` |
| Asistente de la web | `src/features/assistant.js` |
| Planificación de reposición | `src/domain/inventory.js` y `src/features/inventory-view.js` |
| Reglas de ventas y permisos | `src/domain/` y SQL de `supabase/migrations/` |
| Consultas y sesiones de Supabase | `src/services/supabase.js` |
| Colores y aspecto general | `src/styles/theme.css` |
| Estilos comunes y componentes | `src/styles/base.css` |
| Estilos del asistente, pedidos y atención | `src/styles/assistant.css` |
| Comportamiento y seguridad de la IA | `supabase/functions/nutri-ai/` |
| Correo y acceso | Las funciones correspondientes de `supabase/functions/` |

Los estilos se cargan en el orden base → tema → asistente. Se mantienen separados para conservar la apariencia existente; no son tres copias intercambiables. Las migraciones también se conservan: cada una representa un incremento distinto. No vuelvas a aplicar todo el SQL ni los datos ficticios sobre producción por haber cambiado de carpeta.

## Comandos

```sh
npm ci                 # Instalar las dependencias de desarrollo fijadas
npm run dev            # Abrir el servidor local
npm run build          # Regenerar dist/ para Netlify
npm run format         # Ordenar el formato del código
npm run format:check   # Comprobar únicamente el formato
```

Prettier está fijado en el proyecto. Usa dos espacios, punto y coma y un ancho objetivo de 90 caracteres. Las plantillas HTML incrustadas llevan `/* HTML */` para que también se distribuyan de forma legible. URLs, datos SVG y otras cadenas indivisibles pueden superar ese ancho.

Las pruebas existentes se conservaron y sus rutas se actualizaron. Estos comandos son para cuando decidas ejecutarlas:

```sh
npm test
npm run test:db
npm run test:inventory:db
npm run test:observations:db
```

Las páginas de `tests/manual/` son herramientas de revisión y pueden realizar operaciones según sus controles. No se publican en Netlify. Las notas de [validaciones históricas](docs/VALIDACIONES.md) describen fechas anteriores, no una garantía del estado actual.

## Documentación y entrega

- [Alcance y sprints](docs/academico/ALCANCE_Y_SPRINTS.md).
- [Observaciones del docente](docs/academico/OBSERVACIONES_DOCENTE.md).
- [Modelo relacional](docs/arquitectura/MODELO_RELACIONAL.md).
- [Modelos de inventario](docs/arquitectura/MODELOS_INVENTARIO.md).
- [Configuración de Supabase y fotografías](docs/configuracion/CONFIGURAR_SUPABASE.md).
- [GitHub y Netlify](docs/configuracion/GITHUB_NETLIFY.md).
- [Implementación de IA y WhatsApp](docs/ia/IMPLEMENTACION.md).
- [Guion de exposición](docs/academico/exposicion/Guion_exposicion_4_integrantes.md).

Los roles actuales siguen siendo administrador, cajero y almacén. La separación CEO / IT / usuario común quedó pendiente por decisión del propietario y esta reorganización no la implementa. No hay delivery, fabricación ni facturación fiscal. Las pruebas completas de los últimos incrementos corresponden al propietario.

## Seguridad y publicación

En `src/config.js` solo van la URL y la clave pública de Supabase. Credenciales de servicio, OpenAI, YCloud, Make y correo permanecen en sus servicios, nunca en el navegador ni el repositorio. El QR conserva `src/assets/qr-ganadero.png`, también usado por el asistente desplegado.

Netlify publica únicamente `index.html` y `src/` mediante `scripts/build.mjs`. La reorganización local no cambia por sí misma lo desplegado en Supabase o Netlify. Los archivos SQL y de funciones se editan aquí y se despliegan por separado. El documento de IA distingue implementación, publicación y verificación funcional.
