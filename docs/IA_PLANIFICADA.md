# Inteligencia artificial de NutriGalletas

El alcance se amplió por autorización del administrador: además de consultas, el asistente puede preparar ventas, compras recibidas, gastos y recordatorios, siempre con resumen y confirmación. Ninguna respuesta interpretada por OpenAI confirma una operación.

El cerebro se implementa en `supabase/functions/nutri-ai/`, compartido entre la web y WhatsApp. El administrador propietario conserva acceso al ámbito privado. WhatsApp también atiende otros números con catálogo público y solicitudes de compra para revisión, sin información financiera ni acceso a operaciones administrativas; cada conversación se aísla por teléfono. El número del negocio y el administrador se configuran en Supabase. Cajero y almacén conservan sus permisos existentes y no adquieren acceso al asistente.

La guía vigente de implementación, secretos, despliegue, pruebas y pendientes está en [docs/ia/IMPLEMENTACION.md](ia/IMPLEMENTACION.md).

Horarios aprobados: PDF semanal los domingos a las 20:00 Bolivia; alertas diarias a las 08:00. El corte semanal incluye lunes 00:00 a domingo 20:00. La automatización requiere activación y verificación reales; un archivo preparado no prueba que haya llegado un mensaje.
