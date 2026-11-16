begin;
alter table private.ia_clientes_whatsapp add column if not exists ultimo_entrante timestamptz;
alter table public.lotes_inventario add column if not exists cantidad_reservada integer not null default 0;
do $$ begin if not exists(select 1 from pg_constraint where conname='lotes_reserva_valida' and conrelid='public.lotes_inventario'::regclass) then alter table public.lotes_inventario add constraint lotes_reserva_valida check(cantidad_reservada>=0 and cantidad_reservada<=cantidad_disponible); end if; end $$;
create table if not exists private.config_recogida (
 id boolean primary key default true check(id),dias integer[] not null default array[1,2,3,4,5,6],abre time not null default '09:00',cierra time not null default '19:00',anticipacion_min integer not null default 30 check(anticipacion_min between 0 and 1440),nombre_tienda text not null default 'NutriGalletas',direccion text not null default 'La Paz, Bolivia · dirección exacta pendiente de confirmar',ubicacion_confirmada boolean not null default false,mapa_url text not null default '',telefono_contacto text not null default '+59162502582',informacion text not null default 'Solo recogida en tienda. Sin delivery.',max_dias integer not null default 7 check(max_dias between 1 and 30),check(abre<cierra)
);
insert into private.config_recogida(id) values(true) on conflict do nothing;
create table if not exists private.pedidos_whatsapp (
 id uuid primary key default gen_random_uuid(),solicitud_id uuid not null unique,telefono text not null references private.ia_clientes_whatsapp(telefono),nombre text not null,
 estado text not null default 'pendiente_aprobacion' check(estado in ('pendiente_aprobacion','esperando_comprobante','leyendo_comprobante','pago_por_verificar','pagado','listo','entregado','cancelado','expirado')),
 fecha_recogida timestamptz not null,reserva_hasta timestamptz not null default now()+interval '10 minutes',lectura_limite timestamptz,retenido boolean not null default false,
 items jsonb not null,total numeric(14,2) not null check(total>0),venta_id uuid unique references public.ventas(id),
 comprobante_ruta text,lectura jsonb,referencia_banco text,verificado_por uuid references public.perfiles_usuarios(id),pagado_en timestamptz,aprobado_por uuid references public.perfiles_usuarios(id),aprobado_en timestamptz,creado_en timestamptz not null default now(),actualizado_en timestamptz not null default now()
);
create unique index if not exists pedido_referencia_banco_unica on private.pedidos_whatsapp(referencia_banco) where referencia_banco is not null;
create table if not exists private.reservas_pedidos_whatsapp (
 pedido_id uuid not null references private.pedidos_whatsapp(id),lote_id uuid not null references public.lotes_inventario(id),producto_id uuid not null references public.productos(id),cantidad integer not null check(cantidad>0),precio numeric(12,2) not null,costo numeric(12,2) not null,primary key(pedido_id,lote_id)
);
alter table private.config_recogida enable row level security;
alter table private.pedidos_whatsapp enable row level security;
alter table private.reservas_pedidos_whatsapp enable row level security;
revoke all on private.config_recogida,private.pedidos_whatsapp,private.reservas_pedidos_whatsapp from public,anon,authenticated;
grant all on private.config_recogida,private.pedidos_whatsapp,private.reservas_pedidos_whatsapp to service_role;
create or replace function private.expirar_pedidos_whatsapp() returns integer language plpgsql security definer set search_path='' as $$
declare pedido record; linea record; expired integer:=0;
begin
 perform pg_advisory_xact_lock(hashtextextended('nutri-reservas-inventario',0));
 for pedido in select id from private.pedidos_whatsapp where retenido and ((estado='esperando_comprobante' and reserva_hasta<=clock_timestamp())) order by id for update loop
  for linea in select * from private.reservas_pedidos_whatsapp where pedido_id=pedido.id order by lote_id loop update public.lotes_inventario set cantidad_reservada=cantidad_reservada-linea.cantidad where id=linea.lote_id;end loop;
  update private.pedidos_whatsapp set estado='expirado',retenido=false,actualizado_en=now() where id=pedido.id;expired:=expired+1;
 end loop;
 update private.pedidos_whatsapp set estado='pago_por_verificar',lectura=coalesce(lectura,jsonb_build_object('observacion','Lectura interrumpida: comprobar el abono manualmente')),actualizado_en=now() where estado='leyendo_comprobante' and lectura_limite<=clock_timestamp();
 update private.pedidos_whatsapp set estado='expirado',actualizado_en=now() where estado='pendiente_aprobacion' and (reserva_hasta<=clock_timestamp() or fecha_recogida<=clock_timestamp());
 return expired;
end $$;
revoke all on function private.expirar_pedidos_whatsapp() from public,anon,authenticated;
grant execute on function private.expirar_pedidos_whatsapp() to service_role;
create or replace function public.gestionar_pedido_whatsapp(p_telefono text,p_accion text,p_datos jsonb default '{}',p_actor uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o private.pedidos_whatsapp%rowtype; cfg private.config_recogida%rowtype; actor_rol text; item jsonb; line record; lote record; prod public.productos%rowtype; pickup timestamptz; remaining integer; take integer; total_value numeric:=0; cost_value numeric:=0; order_id uuid:=gen_random_uuid(); sale_id uuid:=gen_random_uuid(); items_value jsonb:='[]'; reference_value text;
begin
 perform pg_advisory_xact_lock(hashtextextended('nutri-reservas-inventario',0));
 perform private.expirar_pedidos_whatsapp();
 select * into cfg from private.config_recogida where id;
 if p_accion in ('lista','configurar','aprobar','confirmar_pago','listo','entregar','rechazar','archivo') then
  select rol into actor_rol from public.perfiles_usuarios where id=p_actor and activo;
  if actor_rol is null or actor_rol not in ('administrador','cajero') then raise exception 'Acceso denegado';end if;
  if exists(select 1 from private.contadores_acceso a join public.perfiles_usuarios u on a.identificador='usuario:'||u.email where u.id=p_actor and a.bloqueado_hasta>now()) then raise exception 'Acceso bloqueado temporalmente';end if;
  if p_accion in ('configurar') and actor_rol<>'administrador' then raise exception 'Solo el administrador configura la tienda';end if;
 end if;
 if p_accion='configuracion' then return to_jsonb(cfg);
 elsif p_accion='configurar' then
  if jsonb_array_length(p_datos->'dias') not between 1 and 7 or exists(select 1 from jsonb_array_elements_text(p_datos->'dias') d where d::int not between 0 and 6) then raise exception 'Días de recogida inválidos';end if;
  if length(btrim(coalesce(p_datos->>'nombre_tienda','')))<2 or length(btrim(coalesce(p_datos->>'direccion','')))<5 or (coalesce(p_datos->>'mapa_url','')<>'' and p_datos->>'mapa_url' !~ '^https://') then raise exception 'Completa el nombre, la dirección y un enlace HTTPS válido';end if;
  update private.config_recogida set dias=array(select d::int from jsonb_array_elements_text(p_datos->'dias') d),abre=(p_datos->>'abre')::time,cierra=(p_datos->>'cierra')::time,anticipacion_min=(p_datos->>'anticipacion_min')::int,nombre_tienda=left(btrim(p_datos->>'nombre_tienda'),80),direccion=left(btrim(p_datos->>'direccion'),300),ubicacion_confirmada=coalesce((p_datos->>'ubicacion_confirmada')::boolean,false),mapa_url=left(coalesce(p_datos->>'mapa_url',''),500),telefono_contacto=left(coalesce(p_datos->>'telefono_contacto',''),30),informacion=left(coalesce(p_datos->>'informacion',''),1000) where id returning * into cfg;return to_jsonb(cfg);
 elsif p_accion='lista' then
  return jsonb_build_object('configuracion',to_jsonb(cfg),'pedidos',coalesce((select jsonb_agg(to_jsonb(x)-'referencia_banco' order by x.fecha_recogida) from(select p.*,(select c.ultimo_entrante from private.ia_clientes_whatsapp c where c.telefono=p.telefono) as ultimo_entrante_cliente from private.pedidos_whatsapp p where estado not in ('entregado','cancelado','expirado') or actualizado_en>now()-interval '2 days' order by fecha_recogida limit 100)x),'[]'));
 elsif p_accion in ('reservar','aprobar') then
  if not(extract(dow from clock_timestamp() at time zone 'America/La_Paz')::int=any(cfg.dias)) or (clock_timestamp() at time zone 'America/La_Paz')::time<cfg.abre or (clock_timestamp() at time zone 'America/La_Paz')::time>=cfg.cierra-interval '10 minutes' then raise exception 'Recibimos y aprobamos pedidos durante el horario de tienda, hasta 10 minutos antes del cierre. Puedes consultar el catálogo y volver en horario de atención.';end if;
  if p_accion='aprobar' then
   if not cfg.ubicacion_confirmada then raise exception 'El administrador debe completar y confirmar la dirección real en Información de la tienda antes de aprobar pedidos';end if;
   select * into o from private.pedidos_whatsapp where id=(p_datos->>'id')::uuid for update;
   if o.id is null then raise exception 'Pedido no encontrado';end if;
   if o.estado<>'pendiente_aprobacion' then return jsonb_build_object('id',o.id,'duplicado',true);end if;
   p_telefono:=o.telefono;order_id:=o.id;p_datos:=to_jsonb(o);
  end if;
  if p_telefono !~ '^[1-9][0-9]{7,14}$' then raise exception 'Número inválido';end if;
  if p_accion='reservar' then
  select * into o from private.pedidos_whatsapp where solicitud_id=(p_datos->>'solicitud_id')::uuid;
  if found then if o.telefono<>p_telefono then raise exception 'Acceso denegado';end if;return to_jsonb(o)-'lectura'-'comprobante_ruta'-'referencia_banco'-'verificado_por';end if;
  if exists(select 1 from private.pedidos_whatsapp where telefono=p_telefono and (retenido or estado='pendiente_aprobacion')) then raise exception 'Ya tienes una reserva activa. Envíame su comprobante o escribe CANCELAR para liberar la reserva antes de crear otra.';end if;
  end if;
  if jsonb_typeof(p_datos->'items')<>'array' or jsonb_array_length(p_datos->'items') not between 1 and 15 then raise exception 'Carrito inválido';end if;
  if nullif(btrim(p_datos->>'nombre'),'') is null then raise exception 'Falta el nombre para el pedido';end if;
  pickup:=(p_datos->>'fecha_recogida')::timestamptz;
  if pickup is null or pickup<clock_timestamp()+make_interval(mins=>cfg.anticipacion_min) or pickup>now()+make_interval(days=>cfg.max_dias) or not(extract(dow from pickup at time zone 'America/La_Paz')::int=any(cfg.dias)) or (pickup at time zone 'America/La_Paz')::time<cfg.abre or (pickup at time zone 'America/La_Paz')::time>cfg.cierra then raise exception 'Elige un día de atención entre % y %, con % minutos de anticipación y dentro de los próximos % días.',cfg.abre,cfg.cierra,cfg.anticipacion_min,cfg.max_dias;end if;
  for item in select value from jsonb_array_elements(p_datos->'items') loop if (item->>'cantidad')::numeric<>trunc((item->>'cantidad')::numeric) or (item->>'cantidad')::numeric not between 1 and 100000 then raise exception 'Cantidad inválida';end if;end loop;
  for line in select (value->>'producto_id')::uuid producto_id,sum((value->>'cantidad')::int)::int cantidad,min((value->>'precio')::numeric) precio from jsonb_array_elements(p_datos->'items') group by 1 order by 1 loop
   select * into prod from public.productos where id=line.producto_id for update;
   if not found or not prod.activo or prod.precio_venta<>line.precio then raise exception 'El catálogo cambió. Pide un resumen actualizado antes de confirmar.';end if;
   if (select coalesce(sum(cantidad_disponible-cantidad_reservada),0) from public.lotes_inventario where producto_id=prod.id and fecha_vencimiento>=(pickup at time zone 'America/La_Paz')::date)<line.cantidad then raise exception 'No hay suficientes paquetes aptos para la fecha de recogida de %',prod.nombre;end if;
   total_value:=total_value+line.cantidad*prod.precio_venta;items_value:=items_value||jsonb_build_array(jsonb_build_object('producto_id',prod.id,'nombre',prod.nombre,'cantidad',line.cantidad,'precio',prod.precio_venta));
  end loop;
  if p_accion='reservar' then
   insert into private.pedidos_whatsapp(id,solicitud_id,telefono,nombre,fecha_recogida,items,total,reserva_hasta) values(order_id,(p_datos->>'solicitud_id')::uuid,p_telefono,left(p_datos->>'nombre',100),pickup,items_value,total_value,least(clock_timestamp()+interval '30 minutes',(((clock_timestamp() at time zone 'America/La_Paz')::date+cfg.cierra) at time zone 'America/La_Paz')));
  else
   update private.pedidos_whatsapp set estado='esperando_comprobante',retenido=true,reserva_hasta=clock_timestamp()+interval '10 minutes',aprobado_por=p_actor,aprobado_en=now(),actualizado_en=now() where id=order_id;
  end if;
  if p_accion='aprobar' then
  for line in select (value->>'producto_id')::uuid producto_id,(value->>'cantidad')::int cantidad,(value->>'precio')::numeric precio from jsonb_array_elements(items_value) order by 1 loop
   remaining:=line.cantidad;
   for lote in select * from public.lotes_inventario where producto_id=line.producto_id and cantidad_disponible>cantidad_reservada and fecha_vencimiento>=(pickup at time zone 'America/La_Paz')::date order by fecha_vencimiento,id for update loop
    exit when remaining=0;take:=least(remaining,lote.cantidad_disponible-lote.cantidad_reservada);
    insert into private.reservas_pedidos_whatsapp values(order_id,lote.id,line.producto_id,take,line.precio,lote.costo_unitario);
    update public.lotes_inventario set cantidad_reservada=cantidad_reservada+take where id=lote.id;remaining:=remaining-take;
   end loop;
   if remaining<>0 then raise exception 'Las existencias cambiaron; solicita una nueva reserva';end if;
  end loop;
  end if;
  select * into o from private.pedidos_whatsapp where id=order_id;
 elsif p_accion in ('actual','estado') then
  select * into o from private.pedidos_whatsapp where telefono=p_telefono order by creado_en desc limit 1;
 elsif p_accion='cancelar' then
  select * into o from private.pedidos_whatsapp where telefono=p_telefono and (retenido or estado='pendiente_aprobacion') order by creado_en desc limit 1 for update;
  if o.id is null then
   if exists(select 1 from private.pedidos_whatsapp where telefono=p_telefono and estado in ('pagado','listo','entregado')) then raise exception 'La compra ya fue pagada. Solicita atención humana para revisar una cancelación o devolución.';end if;
   return '{"sin_reserva":true}';end if;
  if o.estado in ('pago_por_verificar','leyendo_comprobante') then raise exception 'Ya enviaste un comprobante. Solicita atención humana para revisar el pago antes de cancelar.';end if;
  for line in select * from private.reservas_pedidos_whatsapp where pedido_id=o.id order by lote_id loop update public.lotes_inventario set cantidad_reservada=cantidad_reservada-line.cantidad where id=line.lote_id;end loop;
  update private.pedidos_whatsapp set estado='cancelado',retenido=false,actualizado_en=now() where id=o.id returning * into o;
 else
  select * into o from private.pedidos_whatsapp where id=(p_datos->>'id')::uuid for update;
  if o.id is null then raise exception 'Pedido no encontrado';end if;
  if p_accion in ('comprobante_iniciar','comprobante_guardar','comprobante_error') and o.telefono<>p_telefono then raise exception 'Acceso denegado';end if;
  if p_accion='comprobante_iniciar' then
   if o.estado not in ('esperando_comprobante','pago_por_verificar') or not o.retenido then raise exception 'No hay una reserva vigente para recibir el comprobante';end if;
   update private.pedidos_whatsapp set estado='leyendo_comprobante',lectura_limite=clock_timestamp()+interval '90 seconds',actualizado_en=now() where id=o.id returning * into o;
  elsif p_accion='comprobante_error' then
   if o.estado='leyendo_comprobante' then update private.pedidos_whatsapp set estado='pago_por_verificar',comprobante_ruta=coalesce(p_datos->>'ruta',comprobante_ruta),lectura=jsonb_build_object('observacion','No se pudo leer la imagen: verificar manualmente con el cliente y en el banco'),actualizado_en=now() where id=o.id returning * into o;perform private.expirar_pedidos_whatsapp();end if;
  elsif p_accion='comprobante_guardar' then
   if o.estado<>'leyendo_comprobante' or not o.retenido then raise exception 'La reserva venció durante la lectura. Contacta al equipo si ya pagaste.';end if;
   reference_value:=nullif(regexp_replace(upper(coalesce(p_datos->'lectura'->>'referencia','')),'[^A-Z0-9]','','g'),'');
   if reference_value is not null and exists(select 1 from private.pedidos_whatsapp where referencia_banco=reference_value and id<>o.id) then raise exception 'Ese comprobante ya está vinculado a otro pedido. Solicita atención humana.';end if;
   update private.pedidos_whatsapp set comprobante_ruta=p_datos->>'ruta',lectura=p_datos->'lectura',referencia_banco=reference_value,
    estado='pago_por_verificar',actualizado_en=now() where id=o.id returning * into o;
  elsif p_accion='archivo' then return jsonb_build_object('ruta',o.comprobante_ruta);
  elsif p_accion='confirmar_pago' then
   if not coalesce((p_datos->>'abono_verificado')::boolean,false) then raise exception 'Marca la verificación del abono en tu banco';end if;
   if o.venta_id is not null then return jsonb_build_object('pedido',to_jsonb(o),'duplicado',true);end if;
   if o.estado<>'pago_por_verificar' or not o.retenido then raise exception 'El pedido no tiene un comprobante recibido y una reserva activa';end if;
   for line in select * from private.reservas_pedidos_whatsapp where pedido_id=o.id order by lote_id loop
    if not exists(select 1 from public.lotes_inventario where id=line.lote_id and cantidad_reservada>=line.cantidad and cantidad_disponible>=line.cantidad and fecha_vencimiento>=(o.fecha_recogida at time zone 'America/La_Paz')::date) then raise exception 'El lote cambió. Revisa el pedido antes de registrar el pago';end if;
    cost_value:=cost_value+line.cantidad*line.costo;
   end loop;
   insert into public.ventas(id,usuario_id,metodo_pago,total,costo_total,solicitud_id,firma_solicitud) values(sale_id,p_actor,'qr',o.total,cost_value,o.id,md5(o.items::text));
   for line in select * from private.reservas_pedidos_whatsapp where pedido_id=o.id order by lote_id loop
    update public.lotes_inventario set cantidad_disponible=cantidad_disponible-line.cantidad,cantidad_reservada=cantidad_reservada-line.cantidad where id=line.lote_id;
    insert into public.detalle_ventas(venta_id,producto_id,lote_id,cantidad,precio_unitario,costo_unitario) values(sale_id,line.producto_id,line.lote_id,line.cantidad,line.precio,line.costo);
    insert into public.movimientos_inventario(lote_id,usuario_id,tipo,cantidad,referencia_id) values(line.lote_id,p_actor,'venta',-line.cantidad,sale_id);
   end loop;
   update private.pedidos_whatsapp set estado='pagado',retenido=false,venta_id=sale_id,verificado_por=p_actor,pagado_en=now(),actualizado_en=now() where id=o.id returning * into o;
  elsif p_accion='listo' then
   if o.estado='pagado' then update private.pedidos_whatsapp set estado='listo',actualizado_en=now() where id=o.id returning * into o;elsif o.estado<>'listo' then raise exception 'Solo se prepara un pedido con pago confirmado';end if;
  elsif p_accion='entregar' then
   if o.estado='listo' then update private.pedidos_whatsapp set estado='entregado',actualizado_en=now() where id=o.id returning * into o;elsif o.estado<>'entregado' then raise exception 'Marca primero el pedido como preparado';end if;
  elsif p_accion='rechazar' then
   if not coalesce((p_datos->>'sin_abono_verificado')::boolean,false) then raise exception 'Verifica que no hubo abono antes de liberar la reserva';end if;
   if o.estado not in ('pendiente_aprobacion','esperando_comprobante','leyendo_comprobante','pago_por_verificar') then raise exception 'No puedes liberar un pedido pagado; requiere revisión de devolución';end if;
   for line in select * from private.reservas_pedidos_whatsapp where pedido_id=o.id order by lote_id loop update public.lotes_inventario set cantidad_reservada=cantidad_reservada-line.cantidad where id=line.lote_id;end loop;
   update private.pedidos_whatsapp set estado='cancelado',retenido=false,actualizado_en=now() where id=o.id returning * into o;
  else raise exception 'Acción inválida';end if;
 end if;
 return case when o.id is null then '{"sin_pedido":true}'::jsonb else jsonb_build_object('id',o.id,'estado',o.estado,'nombre',o.nombre,'items',o.items,'total',o.total,'total_referencial',o.total,'fecha_recogida',o.fecha_recogida,'reserva_hasta',o.reserva_hasta,'venta_id',o.venta_id,'importe_leido',o.lectura->'importe','lectura',case when p_actor is not null then o.lectura else null end) end;
end $$;
revoke all on function public.gestionar_pedido_whatsapp(text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.gestionar_pedido_whatsapp(text,text,jsonb,uuid) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('comprobantes-pedidos','comprobantes-pedidos',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;

create or replace function public.registrar_venta_base(p_items jsonb, p_metodo_pago text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record; v_lote record; v_product public.productos%rowtype; v_sale uuid := gen_random_uuid();
  v_restante integer; v_tomar integer; v_stock bigint; v_total numeric := 0; v_costo numeric := 0;
  v_hoy date := (now() at time zone 'America/La_Paz')::date; v_result jsonb;
begin
  if public.rol_actual() not in ('administrador','cajero') or public.rol_actual() is null then raise exception 'No tienes permiso para vender'; end if;
  perform private.expirar_pedidos_whatsapp();
  if p_metodo_pago not in ('efectivo','qr','tarjeta') or p_metodo_pago is null then raise exception 'Método de pago inválido'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Carrito inválido'; end if;
  if jsonb_array_length(p_items) not between 1 and 50 then raise exception 'El carrito debe tener entre 1 y 50 líneas'; end if;
  for r in select value from jsonb_array_elements(p_items) loop
    if not (r.value ? 'producto_id') or not (r.value ? 'cantidad') then raise exception 'Línea incompleta'; end if;
    if jsonb_typeof(r.value->'cantidad') <> 'number' or (r.value->>'cantidad')::numeric <> trunc((r.value->>'cantidad')::numeric)
      or (r.value->>'cantidad')::numeric not between 1 and 100000 then raise exception 'Cantidad inválida'; end if;
  end loop;
  -- Lock products in deterministic order to avoid cross-cart deadlocks.
  for r in select (value->>'producto_id')::uuid as producto_id, sum((value->>'cantidad')::integer)::integer as cantidad
      from jsonb_array_elements(p_items) group by 1 order by 1 loop
    select * into v_product from public.productos p where p.id = r.producto_id for update;
    if not found or not v_product.activo then raise exception 'Producto no disponible'; end if;
    select coalesce(sum(l.cantidad_disponible-l.cantidad_reservada),0) into v_stock from public.lotes_inventario l where l.producto_id = r.producto_id and l.fecha_vencimiento >= v_hoy;
    if v_stock < r.cantidad then raise exception 'Stock insuficiente para %', v_product.nombre; end if;
  end loop;
  -- The provisional header is never visible outside this atomic transaction.
  insert into public.ventas(id, usuario_id, metodo_pago, total, costo_total) values (v_sale, auth.uid(), p_metodo_pago, 0.01, 0.01);
  for r in select (value->>'producto_id')::uuid as producto_id, sum((value->>'cantidad')::integer)::integer as cantidad
      from jsonb_array_elements(p_items) group by 1 order by 1 loop
    select * into v_product from public.productos p where p.id = r.producto_id;
    v_restante := r.cantidad;
    for v_lote in select * from public.lotes_inventario l where l.producto_id = r.producto_id and l.cantidad_disponible > l.cantidad_reservada and l.fecha_vencimiento >= v_hoy order by l.fecha_vencimiento, l.id for update loop
      exit when v_restante = 0;
      v_tomar := least(v_restante, v_lote.cantidad_disponible-v_lote.cantidad_reservada);
      insert into public.detalle_ventas(venta_id, producto_id, lote_id, cantidad, precio_unitario, costo_unitario)
        values (v_sale, r.producto_id, v_lote.id, v_tomar, v_product.precio_venta, v_lote.costo_unitario);
      update public.lotes_inventario set cantidad_disponible = cantidad_disponible - v_tomar where id = v_lote.id;
      insert into public.movimientos_inventario(lote_id, usuario_id, tipo, cantidad, referencia_id) values(v_lote.id, auth.uid(), 'venta', -v_tomar, v_sale);
      v_total := v_total + v_tomar * v_product.precio_venta; v_costo := v_costo + v_tomar * v_lote.costo_unitario;
      v_restante := v_restante - v_tomar;
    end loop;
    if v_restante <> 0 then raise exception 'Las existencias cambiaron. Intenta nuevamente'; end if;
  end loop;
  update public.ventas set total = v_total, costo_total = v_costo where id = v_sale;
  select to_jsonb(v) into v_result from public.ventas v where id = v_sale;
  return v_result;
end $$;

revoke all on function public.registrar_venta_base(jsonb,text) from public,anon,authenticated;
create or replace function public.consultar_lotes_venta() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_role text;
begin
 actor_role:=public.rol_actual();if actor_role is null then raise exception 'Sesión no autorizada';end if;
 perform private.expirar_pedidos_whatsapp();
 return coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'producto_id',l.producto_id,'compra_id',case when actor_role<>'cajero' then l.compra_id else null end,'codigo_lote',l.codigo_lote,'cantidad_inicial',l.cantidad_inicial,'cantidad_fisica',l.cantidad_disponible,'cantidad_reservada',l.cantidad_reservada,'cantidad_disponible',l.cantidad_disponible-l.cantidad_reservada,'costo_unitario',case when actor_role<>'cajero' then l.costo_unitario else null end,'fecha_vencimiento',l.fecha_vencimiento) order by l.fecha_vencimiento,l.id) from public.lotes_inventario l),'[]');
end $$;
create or replace function public.consultar_existencias() returns table(id uuid,producto_id uuid,cantidad_disponible integer,fecha_vencimiento date) language plpgsql security definer set search_path='' as $$
begin if public.rol_actual() is null then raise exception 'Sesión no autorizada';end if;perform private.expirar_pedidos_whatsapp();return query select l.id,l.producto_id,l.cantidad_disponible-l.cantidad_reservada,l.fecha_vencimiento from public.lotes_inventario l;end $$;
revoke all on function public.consultar_lotes_venta(),public.consultar_existencias() from public,anon;
grant execute on function public.consultar_lotes_venta(),public.consultar_existencias() to authenticated;

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
   coalesce((select sum(l.cantidad_disponible-l.cantidad_reservada) from public.lotes_inventario l where l.producto_id=p.id and l.fecha_vencimiento>=v_today),0) as disponible,
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


create or replace function public.ia_servicio(p_usuario uuid,p_canal text,p_accion text,p_datos jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.ia_conversaciones%rowtype; op private.ia_operaciones%rowtype; sid uuid:=gen_random_uuid();
 old_claims text:=current_setting('request.jwt.claims',true); old_sub text:=current_setting('request.jwt.claim.sub',true);
 r jsonb; d jsonb; item jsonb; monto numeric; prod public.productos%rowtype; inicio timestamptz; fin timestamptz;
begin
 if p_canal not in ('web','whatsapp') or not exists(select 1 from public.perfiles_usuarios where id=p_usuario and activo and rol='administrador') then raise exception 'Acceso denegado'; end if;
 if exists(select 1 from private.contadores_acceso a join public.perfiles_usuarios u on a.identificador='usuario:'||u.email where u.id=p_usuario and a.bloqueado_hasta>now()) then raise exception 'Acceso bloqueado temporalmente'; end if;
 perform private.expirar_pedidos_whatsapp();
 insert into private.ia_conversaciones(usuario_id,canal) values(p_usuario,'web'),(p_usuario,'whatsapp') on conflict do nothing;
 select * into c from private.ia_conversaciones where usuario_id=p_usuario and canal=p_canal for update;
 -- Contexto temporal exclusivamente en esta transacción para reutilizar las mismas reglas de venta/compra.
 insert into private.sesiones_autorizadas(session_id,usuario_id) values(sid,p_usuario);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_usuario,'session_id',sid)::text,true);
 perform set_config('request.jwt.claim.sub',p_usuario::text,true);
 if p_accion='estado' then
  select jsonb_build_object('id',c.id,'estado',c.estado,'historial',case when c.actualizado_en>now()-interval '30 minutes' then c.historial else '[]'::jsonb end,
   'pendientes',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'tipo',o.tipo,'resumen',o.resumen,'vence_en',o.vence_en,'qr',o.datos->>'metodo_pago'='qr')) from private.ia_operaciones o where o.conversacion_id=c.id and o.estado='pendiente' and o.vence_en>now()),'[]'),
   'whatsapp_historial',coalesce((select historial from private.ia_conversaciones where usuario_id=p_usuario and canal='whatsapp'),'[]'),
   'recordatorios',coalesce((select jsonb_agg(to_jsonb(x)) from private.ia_recordatorios x where x.usuario_id=p_usuario and not cancelado and fecha>now()),'[]')) into r;
 elsif p_accion='historial' then
  update private.ia_conversaciones set historial=(select coalesce(jsonb_agg(v order by n),'[]') from jsonb_array_elements((case when actualizado_en>now()-interval '30 minutes' then historial else '[]'::jsonb end)||jsonb_build_array(p_datos)) with ordinality x(v,n) where n>jsonb_array_length((case when actualizado_en>now()-interval '30 minutes' then historial else '[]'::jsonb end)||jsonb_build_array(p_datos))-6),actualizado_en=now(),ultimo_entrante=case when p_datos->>'role'='user' then now() else ultimo_entrante end where id=c.id;
  r:='{"ok":true}';
 elsif p_accion='humano' then
  if p_datos->>'estado' not in ('bot','espera_humana','humano') then raise exception 'Estado inválido'; end if;
  if p_datos->>'estado'='bot' and p_canal<>'web' then raise exception 'Reanuda desde la web'; end if;
  update private.ia_conversaciones set estado=p_datos->>'estado',actualizado_en=now() where usuario_id=p_usuario;
  r:=jsonb_build_object('ok',true,'estado',p_datos->>'estado');
 elsif p_accion='catalogo' then
  r:=jsonb_build_object('configuracion_recogida',(select to_jsonb(cr) from private.config_recogida cr where cr.id),'productos',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'codigo',codigo,'nombre',nombre,'precio_venta',precio_venta,'lotes',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'codigo',l.codigo_lote,'cantidad',l.cantidad_disponible-l.cantidad_reservada,'vence',l.fecha_vencimiento) order by l.fecha_vencimiento,l.id) from public.lotes_inventario l where l.producto_id=public.productos.id and l.cantidad_disponible>l.cantidad_reservada and l.fecha_vencimiento>=(now() at time zone 'America/La_Paz')::date),'[]'))),'[]') from public.productos where activo and codigo !~ '^QA-[0-9]+$'),
  'proveedores',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'nombre',nombre)),'[]') from public.proveedores where activo));
 elsif p_accion='consulta' then
  inicio:=coalesce((p_datos->>'desde')::date,(now() at time zone 'America/La_Paz')::date)::timestamp at time zone 'America/La_Paz';
  fin:=coalesce((p_datos->>'hasta')::timestamptz,now());
  if fin<inicio or fin>now()+interval '1 minute' or fin-inicio>interval '366 days' then raise exception 'Rango inválido (máximo un año, sin futuro)'; end if;
  select jsonb_build_object('desde',inicio,'hasta',fin,'ingreso',coalesce(sum(total),0),'costo_historico',coalesce(sum(costo_total),0),'ventas',count(*)) into r from public.ventas where fecha>=inicio and fecha<=fin;
  select coalesce(sum(g.monto),0) into monto from public.gastos g where g.fecha>=(inicio at time zone 'America/La_Paz')::date and g.fecha<=(fin at time zone 'America/La_Paz')::date and (g.registrado_en is null or g.registrado_en<=fin);
  r:=r||jsonb_build_object('gastos',monto,'ganancia_bruta',(r->>'ingreso')::numeric-(r->>'costo_historico')::numeric,'resultado_neto_estimado',(r->>'ingreso')::numeric-(r->>'costo_historico')::numeric-monto,
  'inventario',public.consultar_resumen_inventario(),
  'parametros',coalesce((select jsonb_agg(to_jsonb(pi)) from public.parametros_inventario pi),'[]'),
  'lotes',coalesce((select jsonb_agg(jsonb_build_object('producto',p.nombre,'lote',l.codigo_lote,'cantidad',l.cantidad_disponible-l.cantidad_reservada,'vence',l.fecha_vencimiento)) from public.lotes_inventario l join public.productos p on p.id=l.producto_id where l.cantidad_disponible>l.cantidad_reservada and p.codigo !~ '^QA-[0-9]+$'),'[]'),
  'rendimiento',coalesce((select jsonb_agg(to_jsonb(x)) from (select p.id,p.nombre,p.precio_venta,coalesce(sum(d.cantidad) filter(where v.fecha>=inicio and v.fecha<=fin),0) as unidades,coalesce(sum(d.cantidad*d.precio_unitario) filter(where v.fecha>=inicio and v.fecha<=fin),0) as ingreso,coalesce(sum(d.cantidad*d.costo_unitario) filter(where v.fecha>=inicio and v.fecha<=fin),0) as costo_historico,max(v.fecha) as ultima_venta from public.productos p left join public.detalle_ventas d on d.producto_id=p.id left join public.ventas v on v.id=d.venta_id where p.activo and p.codigo !~ '^QA-[0-9]+$' group by p.id order by unidades desc,p.nombre) x),'[]'));
 elsif p_accion='borrador' then
  if c.estado<>'bot' then raise exception 'Atención humana activa'; end if;
  if p_datos->>'tipo' not in ('venta','compra','gasto','recordatorio') or length(p_datos->>'resumen') not between 1 and 5000 then raise exception 'Borrador inválido'; end if;
  update private.ia_operaciones set estado='cancelada' where conversacion_id=c.id and estado='pendiente';
  insert into private.ia_operaciones(conversacion_id,tipo,datos,resumen) values(c.id,p_datos->>'tipo',p_datos->'datos',p_datos->>'resumen') returning jsonb_build_object('id',id,'resumen',resumen,'vence_en',vence_en) into r;
 elsif p_accion in ('confirmar','cancelar') then
  select * into op from private.ia_operaciones where id=(p_datos->>'id')::uuid and conversacion_id=c.id for update;
  if not found then raise exception 'Operación no encontrada'; end if;
  if op.estado='confirmada' and p_accion='confirmar' then r:=op.resultado;
  elsif op.estado<>'pendiente' or op.vence_en<=now() then raise exception 'Confirmación cancelada o vencida';
  elsif p_accion='cancelar' then update private.ia_operaciones set estado='cancelada' where id=op.id; r:='{"cancelada":true}';
  else
   if c.estado<>'bot' then raise exception 'Atención humana activa'; end if;
   d:=op.datos;
   if op.tipo='venta' then
    if jsonb_array_length(d->'items') not between 1 and 100 then raise exception 'Venta inválida'; end if;
    for item in select * from jsonb_array_elements(d->'items') loop
     select * into prod from public.productos where id=(item->>'producto_id')::uuid and activo for update;
     if not found or prod.precio_venta<>(item->>'precio')::numeric then raise exception 'Cambió el producto o precio; solicita un resumen nuevo'; end if;
    end loop;
    if d->>'metodo_pago'='qr' and coalesce((p_datos->>'pago_verificado')::boolean,false) is not true then raise exception 'Verifica el abono QR antes de confirmar'; end if;
    r:=public.registrar_venta_cobro(d->'items',d->>'metodo_pago',(d->>'efectivo_recibido')::numeric,d->>'correo_cliente',op.id);
   elsif op.tipo='compra' then r:=public.registrar_compra(d);
   elsif op.tipo='gasto' then
    if length(trim(d->>'concepto')) not between 2 and 160 or length(trim(d->>'categoria')) not between 1 and 160 or (d->>'monto')::numeric<=0 or (d->>'monto')::numeric>999999 or (d->>'fecha')::date>(now() at time zone 'America/La_Paz')::date then raise exception 'Gasto inválido'; end if;
    insert into public.gastos(usuario_id,concepto,categoria,monto,fecha,observacion) values(p_usuario,d->>'concepto',d->>'categoria',(d->>'monto')::numeric,(d->>'fecha')::date,coalesce(d->>'observacion','')) returning to_jsonb(gastos.*) into r;
   else
    if (d->>'fecha')::timestamptz<=now() then raise exception 'El recordatorio debe ser futuro'; end if;
    insert into private.ia_recordatorios(usuario_id,texto,fecha) values(p_usuario,d->>'texto',(d->>'fecha')::timestamptz) returning to_jsonb(ia_recordatorios.*) into r;
   end if;
   update private.ia_operaciones set estado='confirmada',resultado=r where id=op.id;
  end if;
 elsif p_accion='consumo' then
  if (select count(*) from private.ia_eventos where clave like p_canal||':%' and creado_en>now()-interval '1 minute')>6 then raise exception 'Espera un minuto antes de continuar'; end if;
  insert into private.ia_consumo(mes,solicitudes) values(to_char(now() at time zone 'America/La_Paz','YYYY-MM'),1) on conflict(mes) do update set solicitudes=private.ia_consumo.solicitudes+1 returning to_jsonb(ia_consumo.*) into r;
  if (r->>'solicitudes')::int>coalesce((p_datos->>'limite')::int,300) then raise exception 'Límite mensual alcanzado'; end if;
 elsif p_accion='evento' then
  insert into private.ia_eventos(clave) values(p_datos->>'clave') on conflict do nothing;
  if found then r:='{"nuevo":true}'; else select jsonb_build_object('nuevo',false,'respuesta',respuesta) into r from private.ia_eventos where clave=p_datos->>'clave'; end if;
 elsif p_accion='evento_fin' then
  update private.ia_eventos set estado='completo',respuesta=p_datos->'respuesta' where clave=p_datos->>'clave'; r:='{"ok":true}';
 elsif p_accion='envio' then
  insert into private.ia_envios(clave,tipo) values(p_datos->>'clave',p_datos->>'tipo') on conflict do nothing;
  r:=jsonb_build_object('nuevo',found);
 elsif p_accion='envio_fin' then
  update private.ia_envios set estado=p_datos->>'estado',proveedor_id=p_datos->>'proveedor_id',detalle=left(p_datos->>'detalle',1000),actualizado_en=now() where clave=p_datos->>'clave'; r:='{"ok":true}';
 elsif p_accion='agenda' then
  r:=jsonb_build_object('ultimo_entrante',(select max(ultimo_entrante) from private.ia_conversaciones where usuario_id=p_usuario and canal='whatsapp'),'recordatorios',coalesce((select jsonb_agg(to_jsonb(x)) from private.ia_recordatorios x where x.usuario_id=p_usuario and fecha<=now() and not cancelado),'[]'),'envios',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from private.ia_envios order by creado_en desc limit 30)x),'[]'));
 else raise exception 'Acción desconocida'; end if;
 delete from private.sesiones_autorizadas where session_id=sid;
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true); perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 return r;
end $$;
revoke all on function public.ia_servicio(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.ia_servicio(uuid,text,text,jsonb) to service_role;
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
  update private.ia_clientes_whatsapp set historial=(case when actualizado_en>now()-interval '30 minutes' then historial else '[]'::jsonb end)||jsonb_build_array(jsonb_build_object('role','user','content',p_datos->>'mensaje')),actualizado_en=now(),ultimo_entrante=now() where telefono=p_telefono;
  return jsonb_build_object('estado',c.estado,'historial',case when c.actualizado_en>now()-interval '30 minutes' then c.historial else '[]'::jsonb end,'contexto',case when c.actualizado_en>now()-interval '30 minutes' then c.contexto else '{}'::jsonb end,
   'pedido',public.gestionar_pedido_whatsapp(p_telefono,'actual'),'solicitudes',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,tipo,resumen,estado,creado_en from private.ia_solicitudes_clientes where telefono=p_telefono order by creado_en desc limit 5)x),'[]'));
 elsif p_accion='catalogo' then
  return jsonb_build_object('configuracion_recogida',(select to_jsonb(cr) from private.config_recogida cr where cr.id),'productos',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'nombre',p.nombre,'presentacion',p.presentacion,'precio_venta',p.precio_venta,'categoria',cat.nombre,'disponibles',coalesce((select sum(l.cantidad_disponible-l.cantidad_reservada) from public.lotes_inventario l where l.producto_id=p.id and l.fecha_vencimiento>=(now() at time zone 'America/La_Paz')::date),0))) from public.productos p left join public.categorias_productos cat on cat.id=p.categoria_id where p.activo and p.codigo !~ '^QA-[0-9]+$'),'[]'));
 elsif p_accion='consumo' then
  insert into private.ia_consumo(mes,solicitudes) values(to_char(now() at time zone 'America/La_Paz','YYYY-MM'),1) on conflict(mes) do update set solicitudes=private.ia_consumo.solicitudes+1 returning solicitudes into usage_count;
  if usage_count>300 then raise exception 'El asistente está temporalmente ocupado. Puedes solicitar atención humana.'; end if;
  return '{"ok":true}';
 elsif p_accion='confirmar' then
  d:=c.contexto->'propuesta';
  if d is null or coalesce((d->>'vence')::timestamptz,now())<=now() then raise exception 'La propuesta venció. Indica nuevamente los productos que necesitas.'; end if;
  r:=public.gestionar_pedido_whatsapp(p_telefono,'reservar',d||jsonb_build_object('solicitud_id',coalesce(d->>'solicitud_id',(d->>'id'))));
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
  update private.ia_eventos set estado='completo',respuesta=jsonb_build_object('reply',p_datos->>'respuesta','pedido',p_datos->'pedido','enviar_qr',coalesce((p_datos->>'enviar_qr')::boolean,false),'suppressed',coalesce((p_datos->>'silencio')::boolean,false)) where clave='cliente:'||p_telefono||':'||(p_datos->>'evento');
  return '{"ok":true}';
 end if;
 raise exception 'Acción inválida';
end $$;
revoke all on function public.ia_atencion_publica(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.ia_atencion_publica(text,text,jsonb) to service_role;
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
select cron.schedule('nutrigalletas-expirar-reservas','* * * * *','select private.expirar_pedidos_whatsapp();');
commit;
