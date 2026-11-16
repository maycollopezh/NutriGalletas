-- Aplicar después de 001 y 003. No elimina registros existentes.
begin;
alter table public.ventas add column if not exists efectivo_recibido numeric(14,2);
alter table public.ventas add column if not exists cambio numeric(14,2) generated always as (case when metodo_pago='efectivo' and efectivo_recibido is not null then efectivo_recibido-total else null end) stored;
alter table public.ventas add column if not exists correo_cliente text;
alter table public.ventas add column if not exists solicitud_id uuid;
alter table public.ventas add column if not exists firma_solicitud text;
create unique index if not exists ventas_solicitud_unica on public.ventas(solicitud_id) where solicitud_id is not null;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='ventas_cobro_valido' and conrelid='public.ventas'::regclass) then
  alter table public.ventas add constraint ventas_cobro_valido check ((metodo_pago='efectivo' and (efectivo_recibido is null or efectivo_recibido>=total)) or (metodo_pago<>'efectivo' and efectivo_recibido is null));
 end if;
 if to_regprocedure('public.registrar_venta_base(jsonb,text)') is null then alter function public.registrar_venta(jsonb,text) rename to registrar_venta_base; end if;
end $$;
revoke all on function public.registrar_venta_base(jsonb,text) from public, anon, authenticated;

create or replace function public.registrar_venta_cobro(p_items jsonb,p_metodo_pago text,p_efectivo_recibido numeric default null,p_correo_cliente text default null,p_solicitud_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_sale jsonb; v_existing public.ventas%rowtype; v_firma text; v_email text:=nullif(lower(btrim(p_correo_cliente)),'');
begin
 if public.rol_actual() is null or public.rol_actual() not in ('administrador','cajero') then raise exception 'No tienes permiso para vender'; end if;
 if p_metodo_pago='efectivo' and (p_efectivo_recibido is null or p_efectivo_recibido<=0 or p_efectivo_recibido>999999 or p_efectivo_recibido<>round(p_efectivo_recibido,2)) then raise exception 'Ingresa el efectivo recibido con hasta dos decimales'; end if;
 if p_metodo_pago<>'efectivo' and p_efectivo_recibido is not null then raise exception 'El efectivo recibido solo corresponde a pagos en efectivo'; end if;
 if v_email is not null and (length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Correo del cliente inválido'; end if;
 v_firma:=md5(jsonb_build_object('items',p_items,'metodo',p_metodo_pago,'recibido',p_efectivo_recibido,'correo',v_email)::text);
 if p_solicitud_id is not null then
  perform pg_advisory_xact_lock(hashtextextended(p_solicitud_id::text,0));
  select * into v_existing from public.ventas where solicitud_id=p_solicitud_id;
  if found then
   if v_existing.usuario_id<>auth.uid() or v_existing.firma_solicitud<>v_firma then raise exception 'La solicitud ya fue utilizada con otros datos'; end if;
   return to_jsonb(v_existing);
  end if;
 end if;
 v_sale:=public.registrar_venta_base(p_items,p_metodo_pago);
 if p_metodo_pago='efectivo' and p_efectivo_recibido<(v_sale->>'total')::numeric then raise exception 'El efectivo recibido no cubre el total de la venta'; end if;
 update public.ventas set efectivo_recibido=p_efectivo_recibido,correo_cliente=v_email,solicitud_id=p_solicitud_id,firma_solicitud=v_firma where id=(v_sale->>'id')::uuid returning to_jsonb(ventas.*) into v_sale;
 return v_sale;
end $$;
-- Mantiene compatibilidad de QR/tarjeta; efectivo requiere el importe explícito.
create or replace function public.registrar_venta(p_items jsonb,p_metodo_pago text) returns jsonb
language sql security definer set search_path='' as $$ select public.registrar_venta_cobro(p_items,p_metodo_pago,null,null,null) $$;
revoke all on function public.registrar_venta(jsonb,text),public.registrar_venta_cobro(jsonb,text,numeric,text,uuid) from public,anon;
grant execute on function public.registrar_venta(jsonb,text),public.registrar_venta_cobro(jsonb,text,numeric,text,uuid) to authenticated;

-- Cantidades y códigos por lote, sin exponer costos ni datos de proveedores al cajero.
create or replace function public.consultar_lotes_venta() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if public.rol_actual() is null then raise exception 'Sesión no autorizada'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'producto_id',l.producto_id,'codigo_lote',l.codigo_lote,'cantidad_inicial',l.cantidad_inicial,'cantidad_disponible',l.cantidad_disponible,'fecha_vencimiento',l.fecha_vencimiento) order by l.fecha_vencimiento,l.id) from public.lotes_inventario l),'[]'::jsonb);
end $$;
revoke all on function public.consultar_lotes_venta() from public,anon;
grant execute on function public.consultar_lotes_venta() to authenticated;

-- Fuente automática para el avance docente: conserva costos, plazos y reservas.
update public.parametros_inventario set demanda_fuente='historico' where demanda_fuente='manual';
create or replace function public.consultar_resumen_inventario() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_today date:=(now() at time zone 'America/La_Paz')::date; v_result jsonb;
begin
 if public.rol_actual() is null then raise exception 'Sesión no autorizada'; end if;
 with sales as (
  select d.producto_id,(v.fecha at time zone 'America/La_Paz')::date as fecha,sum(d.cantidad)::numeric as cantidad
  from public.detalle_ventas d join public.ventas v on v.id=d.venta_id
  where v.fecha>=((v_today-365)::timestamp at time zone 'America/La_Paz') and v.fecha<(v_today::timestamp at time zone 'America/La_Paz')
  group by 1,2
 ), base as (
  select p.id,p.codigo,p.activo,pi.*,pi.producto_id is not null as configurado,
   coalesce((select sum(l.cantidad_disponible) from public.lotes_inventario l where l.producto_id=p.id and l.fecha_vencimiento>=v_today),0) as disponible,
   h.promedio,h.desviacion
  from public.productos p left join public.parametros_inventario pi on pi.producto_id=p.id
  left join lateral (
   select avg(coalesce(s.cantidad,0)) as promedio,coalesce(stddev_samp(coalesce(s.cantidad,0)),0) as desviacion
   from generate_series(1,coalesce(pi.periodo_dias,30)) dias(n)
   left join sales s on s.producto_id=p.id and s.fecha=v_today-dias.n
  ) h on true
 ), daily as (
  select b.*,case when demanda_fuente='historico' then promedio else demanda_anual/365 end as demanda_diaria from base b
 ), reserve as (
  select d.*,case when not configurado or demanda_diaria<=0 then null when seguridad_metodo='manual' then stock_seguridad else ceil((case nivel_servicio when 0.9 then 1.281551566 when 0.95 then 1.644853627 when 0.975 then 1.959963985 else 2.326347874 end)*desviacion*sqrt(plazo_entrega_dias)) end as reserva from daily d
 ), summary as (
  select r.*,case when configurado and demanda_diaria>0 then ceil(demanda_diaria*plazo_entrega_dias+reserva)::integer else null end as minimo from reserve r
 )
 select coalesce(jsonb_agg(jsonb_build_object('producto_id',id,'configurado',configurado,'demanda_diaria',demanda_diaria,'demanda_fuente',demanda_fuente,'periodo_dias',periodo_dias,'minimo_reposicion',minimo,'reserva',reserva,'unidades_en_camino',coalesce(unidades_en_camino,0),'reponer',coalesce(disponible+unidades_en_camino<=minimo,false)) order by codigo),'[]'::jsonb) into v_result from summary;
 return v_result;
end $$;
revoke all on function public.consultar_resumen_inventario() from public,anon;
grant execute on function public.consultar_resumen_inventario() to authenticated;

-- Registro privado para limitar reenvíos y auditar aceptación por el servidor de correo.
create table if not exists private.envios_recibos (
 id uuid primary key default gen_random_uuid(),venta_id uuid not null references public.ventas(id),usuario_id uuid not null references public.perfiles_usuarios(id),destinatario text not null,estado text not null default 'pendiente' check(estado in ('pendiente','enviado','error')),creado_en timestamptz not null default now(),enviado_en timestamptz,proveedor_id text
);
alter table private.envios_recibos enable row level security;
create index if not exists envios_recibos_usuario_fecha on private.envios_recibos(usuario_id,creado_en);
revoke all on private.envios_recibos from public,anon,authenticated;
grant all on private.envios_recibos to service_role;
create or replace function public.reservar_envio_recibo(p_venta_id uuid,p_usuario_id uuid,p_destinatario text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_sale public.ventas%rowtype;v_role text;v_id uuid;
begin
 select rol into v_role from public.perfiles_usuarios where id=p_usuario_id and activo;
 select * into v_sale from public.ventas where id=p_venta_id;
 if v_role is null or v_sale.id is null or not(v_role='administrador' or (v_role='cajero' and v_sale.usuario_id=p_usuario_id)) then raise exception 'No puedes enviar este recibo'; end if;
 if p_destinatario is null or length(p_destinatario)>254 or p_destinatario !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Correo inválido'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_usuario_id::text,7));
 if exists(select 1 from private.envios_recibos where venta_id=p_venta_id and creado_en>now()-interval '60 seconds') or (select count(*) from private.envios_recibos where usuario_id=p_usuario_id and creado_en>now()-interval '1 hour')>=20 then raise exception 'Espera antes de reenviar el recibo'; end if;
 insert into private.envios_recibos(venta_id,usuario_id,destinatario) values(p_venta_id,p_usuario_id,lower(btrim(p_destinatario))) returning id into v_id; return v_id;
end $$;
create or replace function public.finalizar_envio_recibo(p_envio_id uuid,p_enviado boolean,p_proveedor_id text default null) returns void
language sql security definer set search_path='' as $$ update private.envios_recibos set estado=case when p_enviado then 'enviado' else 'error' end,enviado_en=case when p_enviado then now() else null end,proveedor_id=left(p_proveedor_id,200) where id=p_envio_id and estado='pendiente' $$;
revoke all on function public.reservar_envio_recibo(uuid,uuid,text),public.finalizar_envio_recibo(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.reservar_envio_recibo(uuid,uuid,text),public.finalizar_envio_recibo(uuid,boolean,text) to service_role;
notify pgrst,'reload schema';
commit;
