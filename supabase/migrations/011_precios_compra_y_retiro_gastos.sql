-- Precio sugerido por recargo sobre costo; no modifica costos históricos ni pedidos aprobados.
begin;
alter table public.productos add column if not exists porcentaje_ganancia_sugerido numeric(6,2) not null default 33
 check(porcentaje_ganancia_sugerido between 0 and 500);
create table if not exists private.cambios_precio_compra (
 id uuid primary key default gen_random_uuid(),producto_id uuid not null references public.productos(id),
 compra_id uuid not null references public.compras(id),usuario_id uuid not null references public.perfiles_usuarios(id),
 precio_anterior numeric(12,2) not null,precio_nuevo numeric(12,2) not null,
 porcentaje_sugerido numeric(6,2) not null,creado_en timestamptz not null default now()
);
alter table private.cambios_precio_compra enable row level security;
revoke all on private.cambios_precio_compra from public,anon,authenticated;
grant all on private.cambios_precio_compra to service_role;
-- Retira el registro de gastos; conserva sus datos anteriores como archivo.
revoke insert,update,delete on public.gastos from authenticated,anon;
update private.ia_operaciones set estado='cancelada' where tipo='gasto' and estado='pendiente';
create or replace function public.registrar_compra(p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_compra uuid := gen_random_uuid(); v_lote uuid := gen_random_uuid();
  v_producto uuid := (p_datos->>'producto_id')::uuid; v_proveedor uuid := (p_datos->>'proveedor_id')::uuid;
  v_cantidad integer; v_costo numeric(12,2); v_fecha date := (p_datos->>'fecha_vencimiento')::date;
  v_precio numeric; v_anterior numeric; v_porcentaje numeric; v_actualizar boolean := coalesce((p_datos->>'actualizar_precio_venta')::boolean,false);
  v_codigo text := trim(p_datos->>'codigo_lote'); v_result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('nutri-reservas-inventario',0));
  if public.rol_actual() not in ('administrador','almacen') or public.rol_actual() is null then raise exception 'No tienes permiso para recibir compras'; end if;
  if jsonb_typeof(p_datos->'cantidad') <> 'number' or (p_datos->>'cantidad')::numeric <> trunc((p_datos->>'cantidad')::numeric) then raise exception 'Cantidad inválida'; end if;
  v_cantidad := (p_datos->>'cantidad')::integer; v_costo := (p_datos->>'costo_unitario')::numeric;
  if v_cantidad is null or v_cantidad not between 1 and 100000 or v_costo is null or v_costo <= 0 then raise exception 'Cantidad o costo inválido'; end if;
  if v_fecha is null or v_fecha < (now() at time zone 'America/La_Paz')::date then raise exception 'No se puede recibir un lote vencido'; end if;
  if v_codigo is null or length(v_codigo) = 0 then raise exception 'Falta el código de lote'; end if;
  select precio_venta into v_anterior from public.productos where id = v_producto and activo for update;
  if not found then raise exception 'Producto no disponible'; end if;
  if v_actualizar then
    v_precio:=(p_datos->>'nuevo_precio_venta')::numeric;
    v_porcentaje:=(p_datos->>'porcentaje_ganancia')::numeric;
    if v_precio is null or v_precio<=0 or v_precio>9999999999.99 or v_precio<>round(v_precio,2) then
      raise exception 'Indica un precio de venta válido, con máximo dos decimales';
    end if;
    if v_porcentaje is null or v_porcentaje<0 or v_porcentaje>500 then raise exception 'El porcentaje sobre costo debe estar entre 0 y 500';end if;
    if (p_datos->>'precio_venta_anterior')::numeric is distinct from v_anterior then raise exception 'El precio cambió. Actualiza los datos y revisa la compra antes de guardar';end if;
  end if;
  perform 1 from public.proveedores where id = v_proveedor and activo;
  if not found then raise exception 'Proveedor no disponible'; end if;
  insert into public.compras(id, proveedor_id, usuario_id, total, observacion) values(v_compra, v_proveedor, auth.uid(), v_cantidad * v_costo, coalesce(p_datos->>'observacion',''));
  insert into public.lotes_inventario(id, compra_id, producto_id, codigo_lote, cantidad_inicial, cantidad_disponible, costo_unitario, fecha_vencimiento)
    values(v_lote, v_compra, v_producto, v_codigo, v_cantidad, v_cantidad, v_costo, v_fecha);
  insert into public.detalle_compras(compra_id, producto_id, lote_id, cantidad, costo_unitario) values(v_compra, v_producto, v_lote, v_cantidad, v_costo);
  insert into public.movimientos_inventario(lote_id, usuario_id, tipo, cantidad, referencia_id) values(v_lote, auth.uid(), 'compra', v_cantidad, v_compra);
  if v_actualizar then
    update public.productos set precio_venta=v_precio,porcentaje_ganancia_sugerido=v_porcentaje where id=v_producto;
    insert into private.cambios_precio_compra(producto_id,compra_id,usuario_id,precio_anterior,precio_nuevo,porcentaje_sugerido)
      values(v_producto,v_compra,auth.uid(),v_anterior,v_precio,v_porcentaje);
  end if;
  select to_jsonb(c) into v_result from public.compras c where c.id = v_compra; return v_result;
end $$;

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
  r:=jsonb_build_object('configuracion_recogida',(select to_jsonb(cr) from private.config_recogida cr where cr.id),'productos',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'codigo',codigo,'nombre',nombre,'precio_venta',precio_venta,'porcentaje_ganancia_sugerido',porcentaje_ganancia_sugerido,'lotes',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'codigo',l.codigo_lote,'cantidad',l.cantidad_disponible-l.cantidad_reservada,'vence',l.fecha_vencimiento) order by l.fecha_vencimiento,l.id) from public.lotes_inventario l where l.producto_id=public.productos.id and l.cantidad_disponible>l.cantidad_reservada and l.fecha_vencimiento>=(now() at time zone 'America/La_Paz')::date),'[]'))),'[]') from public.productos where activo and codigo !~ '^QA-[0-9]+$'),
  'proveedores',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'nombre',nombre)),'[]') from public.proveedores where activo));
 elsif p_accion='consulta' then
  inicio:=coalesce((p_datos->>'desde')::date,(now() at time zone 'America/La_Paz')::date)::timestamp at time zone 'America/La_Paz';
  fin:=coalesce((p_datos->>'hasta')::timestamptz,now());
  if fin<inicio or fin>now()+interval '1 minute' or fin-inicio>interval '366 days' then raise exception 'Rango inválido (máximo un año, sin futuro)'; end if;
  select jsonb_build_object('desde',inicio,'hasta',fin,'ingreso',coalesce(sum(total),0),'costo_historico',coalesce(sum(costo_total),0),'ventas',count(*)) into r from public.ventas where fecha>=inicio and fecha<=fin;
  r:=r||jsonb_build_object('ganancia_bruta',(r->>'ingreso')::numeric-(r->>'costo_historico')::numeric,
  'inventario',public.consultar_resumen_inventario(),
  'parametros',coalesce((select jsonb_agg(to_jsonb(pi)) from public.parametros_inventario pi),'[]'),
  'lotes',coalesce((select jsonb_agg(jsonb_build_object('producto',p.nombre,'lote',l.codigo_lote,'cantidad',l.cantidad_disponible-l.cantidad_reservada,'vence',l.fecha_vencimiento)) from public.lotes_inventario l join public.productos p on p.id=l.producto_id where l.cantidad_disponible>l.cantidad_reservada and p.codigo !~ '^QA-[0-9]+$'),'[]'),
  'rendimiento',coalesce((select jsonb_agg(to_jsonb(x)) from (select p.id,p.nombre,p.precio_venta,coalesce(sum(d.cantidad) filter(where v.fecha>=inicio and v.fecha<=fin),0) as unidades,coalesce(sum(d.cantidad*d.precio_unitario) filter(where v.fecha>=inicio and v.fecha<=fin),0) as ingreso,coalesce(sum(d.cantidad*d.costo_unitario) filter(where v.fecha>=inicio and v.fecha<=fin),0) as costo_historico,max(v.fecha) as ultima_venta from public.productos p left join public.detalle_ventas d on d.producto_id=p.id left join public.ventas v on v.id=d.venta_id where p.activo and p.codigo !~ '^QA-[0-9]+$' group by p.id order by unidades desc,p.nombre) x),'[]'));
 elsif p_accion='borrador' then
  if c.estado<>'bot' then raise exception 'Atención humana activa'; end if;
  if p_datos->>'tipo' not in ('venta','compra','recordatorio') or length(p_datos->>'resumen') not between 1 and 5000 then raise exception 'Borrador inválido'; end if;
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
   if op.tipo not in ('venta','compra','recordatorio') then raise exception 'Esta operación ya no está habilitada';end if;
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

commit;
