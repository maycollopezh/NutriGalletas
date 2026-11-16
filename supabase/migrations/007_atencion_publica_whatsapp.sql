-- Atención pública aislada de la información administrativa.
begin;
create table if not exists private.ia_clientes_whatsapp (
 telefono text primary key check(telefono ~ '^[1-9][0-9]{7,14}$'),
 estado text not null default 'bot' check(estado in ('bot','humano')),
 historial jsonb not null default '[]', contexto jsonb not null default '{}',
 actualizado_en timestamptz not null default now()
);
create table if not exists private.ia_solicitudes_clientes (
 id uuid primary key default gen_random_uuid(),
 telefono text not null references private.ia_clientes_whatsapp(telefono),
 tipo text not null check(tipo in ('consulta_compra','humano')),
 resumen text not null, datos jsonb not null default '{}',
 estado text not null default 'pendiente' check(estado in ('pendiente','revisada')),
 creado_en timestamptz not null default now()
);
alter table private.ia_clientes_whatsapp enable row level security;
alter table private.ia_solicitudes_clientes enable row level security;
revoke all on private.ia_clientes_whatsapp,private.ia_solicitudes_clientes from public,anon,authenticated;
grant all on private.ia_clientes_whatsapp,private.ia_solicitudes_clientes to service_role;
create or replace function public.ia_atencion_publica(p_telefono text,p_accion text,p_datos jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,private,pg_temp as $$
declare c private.ia_clientes_whatsapp%rowtype; r jsonb; e jsonb; k text; usage_count int; d jsonb; i jsonb; precio numeric; total numeric:=0;
begin
 if p_accion='lista' then
  return jsonb_build_object('atenciones',coalesce((select jsonb_agg(to_jsonb(x)) from (select telefono,estado,historial,actualizado_en from private.ia_clientes_whatsapp where estado='humano' order by actualizado_en desc limit 30)x),'[]'),
   'solicitudes',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from private.ia_solicitudes_clientes where estado='pendiente' order by creado_en desc limit 30)x),'[]'));
 end if;
 if p_telefono !~ '^[1-9][0-9]{7,14}$' or p_telefono is null then raise exception 'Número inválido'; end if;
 insert into private.ia_clientes_whatsapp(telefono) values(p_telefono) on conflict do nothing;
 select * into c from private.ia_clientes_whatsapp where telefono=p_telefono for update;
 if p_accion='inicio' then
  if length(coalesce(p_datos->>'evento','')) not between 1 and 200 or length(coalesce(p_datos->>'mensaje','')) not between 1 and 2000 then raise exception 'Mensaje inválido'; end if;
  k:='cliente:'||p_telefono||':'||(p_datos->>'evento');
  select respuesta into e from private.ia_eventos where clave=k;
  if found then return jsonb_build_object('duplicado',true,'respuesta',e); end if;
  if (select count(*) from private.ia_eventos where clave like 'cliente:'||p_telefono||':%' and creado_en>now()-interval '1 minute')>=6 then return jsonb_build_object('limitado',true); end if;
  insert into private.ia_eventos(clave) values(k);
  update private.ia_clientes_whatsapp set historial=(case when actualizado_en>now()-interval '30 minutes' then historial else '[]'::jsonb end)||jsonb_build_array(jsonb_build_object('role','user','content',p_datos->>'mensaje')),actualizado_en=now() where telefono=p_telefono;
  return jsonb_build_object('estado',c.estado,'historial',case when c.actualizado_en>now()-interval '30 minutes' then c.historial else '[]'::jsonb end,'contexto',case when c.actualizado_en>now()-interval '30 minutes' then c.contexto else '{}'::jsonb end,
   'solicitudes',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,tipo,resumen,estado,creado_en from private.ia_solicitudes_clientes where telefono=p_telefono order by creado_en desc limit 5)x),'[]'));
 elsif p_accion='catalogo' then
  return jsonb_build_object('productos',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'nombre',p.nombre,'presentacion',p.presentacion,'precio_venta',p.precio_venta,'categoria',cat.nombre)) from public.productos p left join public.categorias_productos cat on cat.id=p.categoria_id where p.activo and p.codigo !~ '^QA-[0-9]+$'),'[]'));
 elsif p_accion='consumo' then
  insert into private.ia_consumo(mes,solicitudes) values(to_char(now() at time zone 'America/La_Paz','YYYY-MM'),1) on conflict(mes) do update set solicitudes=private.ia_consumo.solicitudes+1 returning solicitudes into usage_count;
  if usage_count>300 then raise exception 'El asistente está temporalmente ocupado. Puedes solicitar atención humana.'; end if;
  return '{"ok":true}';
 elsif p_accion='confirmar' then
  d:=c.contexto->'propuesta';
  if d is null or coalesce((d->>'vence')::timestamptz,now())<=now() then raise exception 'La propuesta venció. Indica nuevamente los productos que necesitas.'; end if;
  if jsonb_array_length(d->'items') not between 1 and 15 then raise exception 'Indica los productos nuevamente'; end if;
  for i in select value from jsonb_array_elements(d->'items') loop
   if (i->>'cantidad')::numeric<>trunc((i->>'cantidad')::numeric) or (i->>'cantidad')::numeric not between 1 and 100000 then raise exception 'Cantidad inválida'; end if;
   select precio_venta into precio from public.productos where id=(i->>'producto_id')::uuid and activo;
   if not found or precio<>(i->>'precio')::numeric then raise exception 'El catálogo cambió. Solicita nuevamente la propuesta para revisar los precios.'; end if;
   total:=total+precio*(i->>'cantidad')::int;
  end loop;
  insert into private.ia_solicitudes_clientes(telefono,tipo,resumen,datos) values(p_telefono,'consulta_compra',d->>'resumen',jsonb_build_object('nombre',d->>'nombre','items',d->'items','total_referencial',total)) returning jsonb_build_object('id',id,'total_referencial',total) into r;
  update private.ia_clientes_whatsapp set contexto='{}' where telefono=p_telefono;
  return r;
 elsif p_accion='humano' then
  update private.ia_clientes_whatsapp set estado='humano',contexto='{}',actualizado_en=now() where telefono=p_telefono;
  if not exists(select 1 from private.ia_solicitudes_clientes where telefono=p_telefono and tipo='humano' and estado='pendiente') then
   insert into private.ia_solicitudes_clientes(telefono,tipo,resumen) values(p_telefono,'humano',left(coalesce(p_datos->>'mensaje','Solicita atención humana'),1000));
  end if;
  return '{"ok":true}';
 elsif p_accion='reanudar' then
  update private.ia_clientes_whatsapp set estado='bot',contexto='{}',actualizado_en=now() where telefono=p_telefono;
  update private.ia_solicitudes_clientes set estado='revisada' where telefono=p_telefono and tipo='humano' and estado='pendiente';
  return '{"ok":true}';
 elsif p_accion='revisar' then
  update private.ia_solicitudes_clientes set estado='revisada' where telefono=p_telefono and id=(p_datos->>'id')::uuid;
  return '{"ok":true}';
 elsif p_accion='finalizar' then
  update private.ia_clientes_whatsapp set historial=(select coalesce(jsonb_agg(v order by n),'[]') from jsonb_array_elements(historial||jsonb_build_array(jsonb_build_object('role','assistant','content',left(p_datos->>'respuesta',3500)))) with ordinality a(v,n) where n>jsonb_array_length(historial||'[{}]'::jsonb)-6),contexto=coalesce(p_datos->'contexto','{}'),actualizado_en=now() where telefono=p_telefono;
  update private.ia_eventos set estado='completo',respuesta=jsonb_build_object('reply',p_datos->>'respuesta','suppressed',coalesce((p_datos->>'silencio')::boolean,false)) where clave='cliente:'||p_telefono||':'||(p_datos->>'evento');
  return '{"ok":true}';
 end if;
 raise exception 'Acción inválida';
end $$;
revoke all on function public.ia_atencion_publica(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.ia_atencion_publica(text,text,jsonb) to service_role;
commit;
