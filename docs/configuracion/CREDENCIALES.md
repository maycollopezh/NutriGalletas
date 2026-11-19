# Configuración pública y credenciales privadas

## Lo que puede estar en el navegador

`src/configuracion/publica.js` contiene el modo demo/Supabase, URL del proyecto, clave publicable, nombre del negocio y zona horaria. La clave publicable identifica el proyecto y depende de Auth, RLS y los permisos de las RPC. No reemplaza la autorización.

Nunca colocar en `src/` una clave de servicio, de OpenAI, YCloud, Make ni una contraseña de correo: Netlify publica esa carpeta.

## Lo que permanece en Supabase Secrets

`supabase/functions/nutri-ai/configuracion/entorno.ts` lee variables con `Deno.env`; el archivo no contiene sus valores. Las demás Edge Functions también leen su propio entorno privado.

| Nombres                                                                         | Para qué se usan                                                                                                  |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`                | Conexión de servidor. Service role es privada y nunca va al frontend.                                             |
| `OPENAI_API_KEY`, `OPENAI_MODEL`                                                | Modelo de IA y autenticación privada.                                                                             |
| `YCLOUD_API_KEY`, `YCLOUD_SIGNING_SECRET`, `YCLOUD_BUSINESS_PHONE`              | Envío y autenticidad de WhatsApp.                                                                                 |
| `MAKE_WEBHOOK_SECRET`                                                           | Firma del intercambio con Make.                                                                                   |
| `RECEIPT_GMAIL_USER`, `RECEIPT_GMAIL_APP_PASSWORD`                              | Correo de comprobantes e informes.                                                                                |
| `IA_ADMIN_USER_ID`, `IA_ADMIN_WHATSAPP`, `APP_ORIGIN`, `IA_AUTOMATIONS_ENABLED` | Identidad autorizada, origen web y automatizaciones. Revisar las variables realmente utilizadas por cada función. |

Las conexiones de Make y YCloud se administran en sus paneles. Este documento es un mapa de nombres, no una copia ni un respaldo de credenciales. No se rotó ni movió ninguna credencial con la reorganización.

## Para exponer

Mostrar el código que lee los nombres, sin abrir los valores de Secrets, credenciales de Make, claves de API, comprobantes privados ni sesiones del banco. `.env` y `.env.*` permanecen excluidos de Git. No introducir secretos en documentos, capturas ni ZIP de entrega.
