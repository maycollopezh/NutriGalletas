// Solo lectura del entorno privado de Supabase. Nunca escribir valores reales aquí.
// Los nombres y destinos se explican en docs/configuracion/CREDENCIALES.md.
export const env = (name: string) => Deno.env.get(name) || '';
