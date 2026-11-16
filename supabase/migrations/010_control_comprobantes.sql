-- Comprobantes acumulables: lectura visual preliminar, nunca confirmación bancaria.
begin;
alter table private.pedidos_whatsapp
 add column if not exists pago_revision text not null default 'sin_comprobante'
  check(pago_revision in ('sin_comprobante','parcial','exacto','excedente','revision')),
 add column if not exists total_comprobantes numeric(14,2) not null default 0 check(total_comprobantes>=0),
 add column if not exists importe_banco_verificado numeric(14,2);
create table if not exists private.comprobantes_pedidos_whatsapp (
 id uuid primary key default gen_random_uuid(),
 pedido_id uuid not null references private.pedidos_whatsapp(id),
 ruta text not null unique,lectura jsonb not null,importe numeric,
 contabilizable boolean not null default false,referencia text unique,huella text unique,
 creado_en timestamptz not null default now()
);
alter table private.comprobantes_pedidos_whatsapp enable row level security;
revoke all on private.comprobantes_pedidos_whatsapp from public,anon,authenticated;
grant all on private.comprobantes_pedidos_whatsapp to service_role;
create index if not exists comprobantes_pedido_idx on private.comprobantes_pedidos_whatsapp(pedido_id);
-- Conserva también las imágenes anteriores para revisión; no recalifica pagos históricos.
insert into private.comprobantes_pedidos_whatsapp(pedido_id,ruta,lectura,importe,contabilizable,referencia)
 select id,comprobante_ruta,coalesce(lectura,'{}'),
 case when jsonb_typeof(lectura->'importe')='number' then (lectura->>'importe')::numeric end,
 false,referencia_banco from private.pedidos_whatsapp where comprobante_ruta is not null
 on conflict do nothing;
update private.pedidos_whatsapp set pago_revision='revision'
 where comprobante_ruta is not null and pago_revision='sin_comprobante';
create or replace function public.gestionar_pedido_whatsapp(p_telefono text,p_accion text,p_datos jsonb default '{}',p_actor uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o private.pedidos_whatsapp%rowtype; cfg private.config_recogida%rowtype; actor_rol text; item jsonb; line record; lote record; prod public.productos%rowtype; pickup timestamptz; remaining integer; take integer; total_value numeric:=0; cost_value numeric:=0; order_id uuid:=gen_random_uuid(); sale_id uuid:=gen_random_uuid(); items_value jsonb:='[]'; reference_value text; proof jsonb; amount_value numeric; sum_value numeric;
 valid_value boolean; duplicate_value boolean:=false; hash_value text; classification text;
 bank_value numeric; proof_id uuid;
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
  return jsonb_build_object('configuracion',to_jsonb(cfg),'pedidos',coalesce((select jsonb_agg((to_jsonb(x)-'referencia_banco')||jsonb_build_object('comprobantes',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'lectura',c.lectura,'importe',c.importe,'contabilizable',c.contabilizable,'creado_en',c.creado_en) order by c.creado_en) from private.comprobantes_pedidos_whatsapp c where c.pedido_id=x.id),'[]')) order by x.fecha_recogida) from(select p.*,(select c.ultimo_entrante from private.ia_clientes_whatsapp c where c.telefono=p.telefono) as ultimo_entrante_cliente from private.pedidos_whatsapp p where estado not in ('entregado','cancelado','expirado') or actualizado_en>now()-interval '2 days' order by fecha_recogida limit 100)x),'[]'));
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
   if o.estado='leyendo_comprobante' then
    if nullif(p_datos->>'ruta','') is not null and p_datos->>'ruta' like o.id::text||'/%' then
     insert into private.comprobantes_pedidos_whatsapp(pedido_id,ruta,lectura,contabilizable)
      values(o.id,p_datos->>'ruta',jsonb_build_object('observacion','Lectura interrumpida: revisar manualmente la imagen y el banco'),false)
      on conflict(ruta) do nothing;
    end if;
    update private.pedidos_whatsapp set estado='pago_por_verificar',pago_revision='revision',comprobante_ruta=coalesce(p_datos->>'ruta',comprobante_ruta),lectura=jsonb_build_object('observacion','No se pudo leer la imagen: verificar manualmente con el cliente y en el banco'),actualizado_en=now() where id=o.id returning * into o;
    perform private.expirar_pedidos_whatsapp();
   end if;
  elsif p_accion='comprobante_guardar' then
   if o.estado not in ('leyendo_comprobante','pago_por_verificar') or not o.retenido then raise exception 'La reserva venció durante la lectura. Contacta al equipo si ya pagaste.';end if;
   proof:=p_datos->'lectura';
   reference_value:=nullif(regexp_replace(upper(coalesce(proof->>'referencia','')),'[^A-Z0-9]','','g'),'');
   hash_value:=nullif(p_datos->>'huella','');
   if hash_value is not null and hash_value !~ '^[a-f0-9]{64}$' then raise exception 'Huella inválida';end if;
   if nullif(p_datos->>'ruta','') is null or p_datos->>'ruta' not like o.id::text||'/%' then raise exception 'Comprobante inválido';end if;
   amount_value:=case when jsonb_typeof(proof->'importe')='number' then (proof->>'importe')::numeric else null end;
   valid_value:=coalesce((proof->>'legible')::boolean,false) and proof->>'moneda'='BOB'
    and proof->>'destino'='coincide' and amount_value>0 and amount_value<100000000
    and amount_value=round(amount_value,2) and reference_value is not null;
   -- Una referencia o imagen ya recibida nunca incrementa el importe acumulado.
   select id into proof_id from private.comprobantes_pedidos_whatsapp
    where (reference_value is not null and referencia=reference_value) or (hash_value is not null and huella=hash_value) limit 1;
   if proof_id is not null then
    if exists(select 1 from private.comprobantes_pedidos_whatsapp where id=proof_id and pedido_id=o.id) then
     duplicate_value:=true;
    else
     valid_value:=false;
     insert into private.comprobantes_pedidos_whatsapp(pedido_id,ruta,lectura,importe,contabilizable)
      values(o.id,p_datos->>'ruta',proof||jsonb_build_object('observacion','Imagen o referencia vinculada a otro pedido: requiere atención humana'),amount_value,false);
    end if;
   else
    if reference_value is not null and exists(select 1 from private.pedidos_whatsapp where referencia_banco=reference_value and id<>o.id) then valid_value:=false;end if;
    insert into private.comprobantes_pedidos_whatsapp(pedido_id,ruta,lectura,importe,contabilizable,referencia,huella)
     values(o.id,p_datos->>'ruta',proof,amount_value,coalesce(valid_value,false),reference_value,hash_value);
   end if;
   select coalesce(sum(importe) filter(where contabilizable),0) into sum_value from private.comprobantes_pedidos_whatsapp where pedido_id=o.id;
   classification:=case
    when exists(select 1 from private.comprobantes_pedidos_whatsapp where pedido_id=o.id and not contabilizable) then 'revision'
    when sum_value<o.total then 'parcial' when sum_value>o.total then 'excedente' else 'exacto' end;
   update private.pedidos_whatsapp set comprobante_ruta=p_datos->>'ruta',lectura=proof,
    estado='pago_por_verificar',pago_revision=classification,total_comprobantes=sum_value,actualizado_en=now()
    where id=o.id returning * into o;
   if classification in ('revision','excedente') then
    perform public.ia_atencion_publica(o.telefono,'humano',jsonb_build_object('mensaje',
     case when classification='excedente' then 'Posible excedente de Bs '||round(sum_value-o.total,2)||'. Verificar abonos y coordinar cambio. Pedido '||o.id
      else 'Comprobante ilegible, destino/referencia dudosos o repetidos: verificar con el cliente y en el banco. Pedido '||o.id end));
   end if;
  elsif p_accion='archivo' then
   if p_datos->>'comprobante_id' is not null then
    return jsonb_build_object('ruta',(select ruta from private.comprobantes_pedidos_whatsapp where id=(p_datos->>'comprobante_id')::uuid and pedido_id=o.id));
   end if;
   return jsonb_build_object('ruta',o.comprobante_ruta);
  elsif p_accion='confirmar_pago' then
   if not coalesce((p_datos->>'abono_verificado')::boolean,false) then raise exception 'Marca la verificación del abono en tu banco';end if;
   if o.venta_id is null then
    bank_value:=(p_datos->>'importe_banco_verificado')::numeric;
    if bank_value is null or bank_value<o.total or bank_value<>round(bank_value,2) or bank_value>=100000000 then
     raise exception 'Indica el importe total realmente abonado en el banco; debe cubrir el pedido';end if;
    if bank_value>o.total and not coalesce((p_datos->>'excedente_revisado')::boolean,false) then
     raise exception 'Revisa y reconoce el cambio pendiente antes de confirmar';end if;
    update private.pedidos_whatsapp set importe_banco_verificado=bank_value where id=o.id returning * into o;
   end if;
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
 return case when o.id is null then '{"sin_pedido":true}'::jsonb else jsonb_build_object('id',o.id,'estado',o.estado,'nombre',o.nombre,'items',o.items,'total',o.total,'total_referencial',o.total,'fecha_recogida',o.fecha_recogida,'reserva_hasta',o.reserva_hasta,'venta_id',o.venta_id,'pago_revision',o.pago_revision,'total_comprobantes',o.total_comprobantes,'faltante',greatest(o.total-o.total_comprobantes,0),'excedente',greatest(o.total_comprobantes-o.total,0),'comprobante_duplicado',duplicate_value,'importe_leido',o.lectura->'importe','lectura',case when p_actor is not null then o.lectura else null end) end;
end $$;
revoke all on function public.gestionar_pedido_whatsapp(text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.gestionar_pedido_whatsapp(text,text,jsonb,uuid) to service_role;

commit;
