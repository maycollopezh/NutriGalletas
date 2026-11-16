-- Incremental: conserva usuarios, ventas, lotes y permisos existentes.
begin;
alter table public.gastos add column if not exists registrado_en timestamptz;
alter table public.gastos alter column registrado_en set default now();
create table if not exists private.ia_conversaciones (
 id uuid primary key default gen_random_uuid(), usuario_id uuid not null references public.perfiles_usuarios(id),
 canal text not null check(canal in ('web','whatsapp')), estado text not null default 'bot' check(estado in ('bot','espera_humana','humano')),
 historial jsonb not null default '[]', actualizado_en timestamptz not null default now(), ultimo_entrante timestamptz,
 unique(usuario_id,canal)
);
create table if not exists private.ia_operaciones (
 id uuid primary key default gen_random_uuid(), conversacion_id uuid not null references private.ia_conversaciones(id),
 tipo text not null check(tipo in ('venta','compra','gasto','recordatorio')), datos jsonb not null, resumen text not null,
 estado text not null default 'pendiente' check(estado in ('pendiente','confirmada','cancelada')),
 vence_en timestamptz not null default now()+interval '10 minutes', resultado jsonb, creado_en timestamptz not null default now()
);
create table if not exists private.ia_recordatorios (
 id uuid primary key default gen_random_uuid(), usuario_id uuid not null references public.perfiles_usuarios(id),
 texto text not null check(length(texto) between 1 and 500), fecha timestamptz not null, creado_en timestamptz not null default now(), cancelado boolean not null default false
);
create table if not exists private.ia_eventos (
 clave text primary key, estado text not null default 'procesando', respuesta jsonb, creado_en timestamptz not null default now()
);
create table if not exists private.ia_envios (
 clave text primary key, tipo text not null, estado text not null default 'reservado' check(estado in ('reservado','aceptado','entregado','fallido','incierto')),
 proveedor_id text, detalle text, creado_en timestamptz not null default now(), actualizado_en timestamptz not null default now()
);
create table if not exists private.ia_consumo (
 mes text primary key, solicitudes integer not null default 0, tokens bigint not null default 0
);
revoke all on private.ia_conversaciones,private.ia_operaciones,private.ia_recordatorios,private.ia_eventos,private.ia_envios,private.ia_consumo from public,anon,authenticated;
alter table private.ia_conversaciones enable row level security;
alter table private.ia_operaciones enable row level security;
alter table private.ia_recordatorios enable row level security;
alter table private.ia_eventos enable row level security;
alter table private.ia_envios enable row level security;
alter table private.ia_consumo enable row level security;
grant all on private.ia_conversaciones,private.ia_operaciones,private.ia_recordatorios,private.ia_eventos,private.ia_envios,private.ia_consumo to service_role;
-- Solo backend. No es una RPC utilizable desde el navegador con la clave pública.
create or replace function public.ia_servicio(p_usuario uuid,p_canal text,p_accion text,p_datos jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.ia_conversaciones%rowtype; op private.ia_operaciones%rowtype; sid uuid:=gen_random_uuid();
 old_claims text:=current_setting('request.jwt.claims',true); old_sub text:=current_setting('request.jwt.claim.sub',true);
 r jsonb; d jsonb; item jsonb; monto numeric; prod public.productos%rowtype; inicio timestamptz; fin timestamptz;
begin
 if p_canal not in ('web','whatsapp') or not exists(select 1 from public.perfiles_usuarios where id=p_usuario and activo and rol='administrador') then raise exception 'Acceso denegado'; end if;
 if exists(select 1 from private.contadores_acceso a join public.perfiles_usuarios u on a.identificador='usuario:'||u.email where u.id=p_usuario and a.bloqueado_hasta>now()) then raise exception 'Acceso bloqueado temporalmente'; end if;
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
  r:=jsonb_build_object('productos',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'codigo',codigo,'nombre',nombre,'precio_venta',precio_venta,'lotes',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'codigo',l.codigo_lote,'cantidad',l.cantidad_disponible,'vence',l.fecha_vencimiento) order by l.fecha_vencimiento,l.id) from public.lotes_inventario l where l.producto_id=public.productos.id and l.cantidad_disponible>0 and l.fecha_vencimiento>=(now() at time zone 'America/La_Paz')::date),'[]'))),'[]') from public.productos where activo and codigo !~ '^QA-[0-9]+$'),
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
  'lotes',coalesce((select jsonb_agg(jsonb_build_object('producto',p.nombre,'lote',l.codigo_lote,'cantidad',l.cantidad_disponible,'vence',l.fecha_vencimiento)) from public.lotes_inventario l join public.productos p on p.id=l.producto_id where l.cantidad_disponible>0 and p.codigo !~ '^QA-[0-9]+$'),'[]'),
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
commit;
