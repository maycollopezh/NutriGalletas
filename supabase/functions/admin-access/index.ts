import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

// This endpoint accepts anonymous login/recovery but verifies every admin operation.
const url = Deno.env.get('SUPABASE_URL')!;
const publicKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const origin = Deno.env.get('APP_ORIGIN')!;
const redirectTo = Deno.env.get('RECOVERY_REDIRECT_URL')!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
function check(error: unknown) { if (error) throw new Error('No se pudo completar la operación.'); }
function normalizedEmail(value: unknown) {
  if (typeof value !== 'string') throw new Error('Correo inválido.');
  const email = value.toLowerCase().trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Correo inválido.');
  return email;
}
function validateProfile(body: Record<string, unknown>) {
  if (typeof body.nombre !== 'string' || body.nombre.trim().length < 2 || body.nombre.length > 160) throw new Error('Nombre inválido.');
  if (!['administrador', 'cajero', 'almacen'].includes(String(body.rol))) throw new Error('Rol inválido.');
  if (typeof body.activo !== 'boolean') throw new Error('Estado inválido.');
  return { nombre: body.nombre.trim(), email: normalizedEmail(body.email), rol: String(body.rol), activo: body.activo };
}
function sessionIdFromVerifiedToken(token: string) {
  // Called only after auth.getUser(token) verifies the token with Supabase Auth.
  const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const sessionId = JSON.parse(atob(payload)).session_id;
  if (typeof sessionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(sessionId)) throw new Error('Sesión inválida.');
  return sessionId;
}
async function ipHash(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, '0')).join('');
}
Deno.serve(async req => {
  if (!origin || !redirectTo) return reply({ error: 'Falta configurar el origen y la URL de recuperación.' }, 503);
  if (req.headers.get('origin') !== origin) return reply({ error: 'Origen no permitido.' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Método no permitido.' }, 405);
  try {
    const raw = await req.text(); if (raw.length > 12000) return reply({ error: 'Solicitud demasiado grande.' }, 413);
    const body = JSON.parse(raw) as Record<string, unknown>;
    const action = body.action;
    if (action === 'login' || action === 'recover') {
      const email = normalizedEmail(body.email);
      const { data: allowed, error: reserveError } = await admin.rpc('reservar_intento', { p_email: email, p_ip_hash: await ipHash(req) });
      check(reserveError);
      if (!allowed) return reply({ error: 'Demasiados intentos. Espera 15 minutos e inténtalo nuevamente.' }, 429);
      if (action === 'recover') {
        const { data: profile, error: profileError } = await admin.from('perfiles_usuarios').select('*').eq('email', email).eq('rol', 'administrador').eq('activo', true).maybeSingle();
        check(profileError);
        if (profile) {
          const authz = await admin.rpc('autorizar_recuperacion', { p_usuario_id: profile.id, p_solicitado_por: profile.id }); check(authz.error);
          const recovery = await admin.auth.resetPasswordForEmail(email, { redirectTo }); check(recovery.error);
        }
        return reply({ ok: true });
      }
      if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 200) {
        const log = await admin.rpc('finalizar_intento', { p_email: email, p_exito: false }); check(log.error);
        throw new Error('Credenciales inválidas.');
      }
      const authClient = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: authData, error: authError } = await authClient.auth.signInWithPassword({ email, password: body.password });
      if (authError || !authData.user || !authData.session) {
        const log = await admin.rpc('finalizar_intento', { p_email: email, p_exito: false }); check(log.error);
        return reply({ error: 'Credenciales inválidas o cuenta no disponible.' }, 401);
      }
      const { data: profile, error: profileError } = await admin.from('perfiles_usuarios').select('*').eq('id', authData.user.id).eq('activo', true).maybeSingle();
      check(profileError);
      if (!profile) {
        const log = await admin.rpc('finalizar_intento', { p_email: email, p_exito: false }); check(log.error);
        return reply({ error: 'Credenciales inválidas o cuenta no disponible.' }, 401);
      }
      const { data: verified, error: verifyError } = await authClient.auth.getUser(authData.session.access_token);
      check(verifyError); if (verified.user?.id !== profile.id) throw new Error('Sesión inválida.');
      const sessionId = sessionIdFromVerifiedToken(authData.session.access_token);
      const log = await admin.rpc('finalizar_intento', { p_email: email, p_exito: true }); check(log.error);
      const authorization = await admin.rpc('autorizar_sesion', { p_session_id: sessionId, p_usuario_id: profile.id }); check(authorization.error);
      return reply({ profile, session: { access_token: authData.session.access_token, refresh_token: authData.session.refresh_token } });
    }
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return reply({ error: 'Inicia sesión.' }, 401);
    const { data: verified, error: verifyError } = await admin.auth.getUser(token);
    if (verifyError || !verified.user) return reply({ error: 'Sesión inválida.' }, 401);
    const sessionId = sessionIdFromVerifiedToken(token);
    if (action === 'logout') { const revoke = await admin.rpc('revocar_sesion', { p_session_id: sessionId }); check(revoke.error); return reply({ ok: true }); }
    const caller = createClient(url, publicKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
    const { data: role, error: roleError } = await caller.rpc('rol_actual'); check(roleError);
    if (!role) return reply({ error: 'Sesión no autorizada. Inicia sesión nuevamente.' }, 403);
    if (role !== 'administrador') return reply({ error: 'Solo el administrador puede gestionar cuentas.' }, 403);
    if (action === 'create_user') {
      const profile = validateProfile(body);
      if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 200) throw new Error('La contraseña debe tener entre 12 y 200 caracteres.');
      const created = await admin.auth.admin.createUser({ email: profile.email, password: body.password, email_confirm: true });
      if (created.error || !created.data.user) throw new Error('No se pudo crear la cuenta. Revisa si el correo ya existe.');
      const saved = await admin.from('perfiles_usuarios').insert({ ...profile, id: created.data.user.id }).select().single();
      if (saved.error) { await admin.auth.admin.deleteUser(created.data.user.id); throw new Error('No se pudo guardar el perfil.'); }
      return reply(saved.data);
    }
    if (action === 'update_user' || action === 'reset_user') {
      if (typeof body.user_id !== 'string') throw new Error('Usuario inválido.');
      const { data: existing, error } = await admin.from('perfiles_usuarios').select('*').eq('id', body.user_id).single(); check(error);
      if (action === 'reset_user') {
        if (existing.rol === 'administrador') throw new Error('Los administradores usan la recuperación por correo.');
        if (!existing.activo) throw new Error('Activa la cuenta antes de restablecer su acceso.');
        const authz = await admin.rpc('autorizar_recuperacion', { p_usuario_id: existing.id, p_solicitado_por: verified.user.id }); check(authz.error);
        const reset = await admin.auth.resetPasswordForEmail(existing.email, { redirectTo }); check(reset.error);
        return reply({ ok: true });
      }
      const profile = validateProfile(body);
      if (body.user_id === verified.user.id && (!profile.activo || profile.rol !== 'administrador')) throw new Error('No puedes desactivar ni cambiar tu propio rol.');
      // Email remains fixed after creation, avoiding partial updates across Auth and profiles.
      if (profile.email !== existing.email) throw new Error('El correo de una cuenta existente no puede cambiarse desde este formulario.');
      const saved = await admin.from('perfiles_usuarios').update(profile).eq('id', body.user_id).select().single(); check(saved.error);
      return reply(saved.data);
    }
    return reply({ error: 'Operación no disponible.' }, 400);
  } catch (error) { return reply({ error: error instanceof Error ? error.message : 'No se pudo completar la operación.' }, 400); }
});
