# GitHub y Netlify: despliegue final

El usuario decidió que el proyecto se subirá a GitHub y se desplegará en Netlify al final. No se ha creado un repositorio remoto ni publicado el sitio en esta entrega.

## Arquitectura

- Netlify: `index.html` y `src/`, interfaz estática.
- Supabase: Auth, PostgreSQL y funciones protegidas.
- Make/YCloud/OpenAI/correo: integración futura del sprint 4.

`netlify.toml` ejecuta `node scripts/build.mjs` y publica únicamente `dist/`. El SQL, documentación, pruebas y funciones de Supabase quedan en GitHub para revisión, pero no se sirven como archivos del sitio. El servidor `server.mjs` es solo para la vista previa local.

## Antes de publicar

1. Verificar los permisos, flujo de recuperación y operaciones conectadas a Supabase.
2. Configurar `src/config.js` en modo `supabase`. La URL y clave pública pueden ir al repositorio; los secretos no.
3. Crear el repositorio que el usuario indique y subir el código. Revisar que no se incluyan `.env`, contraseñas ni claves privadas.
4. Conectar el repositorio a Netlify. El proyecto no necesita una compilación de framework.
5. Al obtener el dominio, cambiar `APP_ORIGIN` y `RECOVERY_REDIRECT_URL` de las funciones Supabase al dominio exacto. Actualizar las URL autorizadas de Auth y volver a desplegar las funciones.
6. Probar desde el dominio final inicio de sesión, recuperaciones, roles, venta, recepción y actualización en dos sesiones.

Durante el desarrollo se usa `http://127.0.0.1:4317`. Al cambiar de dominio no se debe dejar una lista abierta de orígenes para solucionar errores de conexión.

## Verificación local del empaquetado

```sh
npm run build
```

No hay publicación automática ni conexión a GitHub configurada todavía. La demostración no debe presentarse como sistema online seguro.
