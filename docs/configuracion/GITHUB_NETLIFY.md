# GitHub y Netlify

Repositorio existente: [NutriGalletas en GitHub](https://github.com/maycollopezh/NutriGalletas). Sitio existente: [NutriGalletas en Netlify](https://nutrigalletas-lp.netlify.app/). Estos destinos ya fueron utilizados en el proyecto; esta reorganización de carpetas es local y no los vuelve a publicar automáticamente.

## Qué se publica en cada servicio

- GitHub guarda el código, documentación y migraciones versionadas.
- Netlify ejecuta `node scripts/build.mjs` y sirve únicamente `dist/`: HTML, `src/` y configuración pública.
- Supabase mantiene Auth, PostgreSQL y las funciones protegidas.
- Make, YCloud, OpenAI y correo usan las conexiones existentes. El alcance y límites están en [implementación de IA](../ia/IMPLEMENTACION.md).

## Preparar la web

Desde la raíz del proyecto:

```sh
npm run build
```

La salida se regenera desde cero para no conservar archivos de rutas antiguas. `tests/`, `docs/`, SQL y funciones privadas no se incluyen. El servidor `scripts/dev-server.mjs` solo se usa con `npm run dev` para abrir la copia local.

Antes de publicar, revisa el diff y los archivos que subirás. El repositorio excluye `.env`, dependencias y archivos generados. Conserva `src/configuracion/publica.js` con valores públicos. Al publicar en otro dominio, también deben actualizarse los orígenes y destinos autorizados de Auth, recuperación y funciones; no amplíes esos permisos con comodines para resolver un error.

## Supabase

Mover un archivo a `supabase/migrations/` no ejecuta SQL. Las migraciones numeradas existentes se aplican según el estado real del proyecto; no se repiten todas por esta reorganización. `supabase/seeds/002_seed.sql` contiene datos ficticios y no debe usarse para reiniciar la base de datos real.

El paquete del asistente puede prepararse con `node scripts/build-ai-function.mjs`, que genera `/tmp/nutrigalletas-ai/index.ts` sin incluir valores secretos. Preparar el paquete no lo despliega ni verifica sus respuestas. Las pruebas funcionales y los envíos reales solo se realizan cuando el propietario los autoriza.
