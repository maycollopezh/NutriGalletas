begin;
-- Solo backend: conserva el permiso existente del administrador para atención pública.
create or replace function public.ia_bandeja_whatsapp() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('conversaciones',coalesce((select jsonb_agg(to_jsonb(x) order by x.solicita_atencion desc,x.actualizado_en desc) from (
  select c.telefono,c.estado,c.historial,c.actualizado_en,
   exists(select 1 from private.ia_solicitudes_clientes s where s.telefono=c.telefono and s.tipo='humano' and s.estado='pendiente') as solicita_atencion,
   (select s.resumen from private.ia_solicitudes_clientes s where s.telefono=c.telefono and s.tipo='humano' and s.estado='pendiente' order by s.creado_en desc limit 1) as motivo
  from private.ia_clientes_whatsapp c order by (c.estado='humano') desc,c.actualizado_en desc limit 100
 ) x),'[]'::jsonb));
$$;
revoke all on function public.ia_bandeja_whatsapp() from public,anon,authenticated;
grant execute on function public.ia_bandeja_whatsapp() to service_role;
commit;
