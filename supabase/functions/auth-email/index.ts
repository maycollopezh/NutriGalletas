import { Webhook } from 'npm:standardwebhooks@1.0.0';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

// Required to prevent employees bypassing the app via Auth's public recovery API.
const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const hookSecret = Deno.env.get('SEND_EMAIL_HOOK_SECRET')!;
const apiKey = Deno.env.get('RESEND_API_KEY')!;
const mailFrom = Deno.env.get('MAIL_FROM')!;
const allowedRedirect = Deno.env.get('RECOVERY_REDIRECT_URL')!;
Deno.serve(async req => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  try {
    const raw = await req.text();
    const secret = hookSecret.replace(/^v1,whsec_/, '');
    const event = new Webhook(secret).verify(raw, Object.fromEntries(req.headers)) as {
      user: { id: string; email: string };
      email_data: { email_action_type: string; token_hash: string; redirect_to: string };
    };
    if (event.email_data.email_action_type !== 'recovery') return Response.json({ error: { http_code: 403, message: 'Registro público deshabilitado.' } }, { status: 403 });
    if (event.email_data.redirect_to !== allowedRedirect) return Response.json({ error: { http_code: 403, message: 'Destino no autorizado.' } }, { status: 403 });
    const permission = await client.rpc('consumir_recuperacion', { p_usuario_id: event.user.id });
    if (permission.error || !permission.data) return Response.json({ error: { http_code: 403, message: 'Recuperación no autorizada.' } }, { status: 403 });
    const link = new URL('/auth/v1/verify', Deno.env.get('SUPABASE_URL'));
    link.searchParams.set('token', event.email_data.token_hash);
    link.searchParams.set('type', 'recovery');
    link.searchParams.set('redirect_to', allowedRedirect);
    const send = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: mailFrom, to: [event.user.email], subject: 'Restablece tu acceso a NutriGalletas', text: `Se solicitó restablecer tu contraseña de NutriGalletas.\n\nAbre este enlace para continuar:\n${link}\n\nSi no solicitaste este cambio, ignora este correo.` }),
    });
    if (!send.ok) return Response.json({ error: { http_code: 500, message: 'No se pudo enviar el correo.' } }, { status: 500 });
    return Response.json({});
  } catch { return Response.json({ error: { http_code: 401, message: 'Firma no válida o configuración incompleta.' } }, { status: 401 }); }
});
