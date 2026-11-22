-- Historial central desde la instalación; no reconstruye acciones antiguas.
begin;
create table if not exists private.registro_auditoria (
 id bigint generated always as identity primary key,
 fecha timestamptz not null default clock_timestamp(),
 usuario_id uuid, nombre text not null, rol text not null,
 accion text not null, entidad text not null, registro text,
 origen text not null, resultado text not null default 'confirmado',
 campos text[] not null default '{}', antes jsonb, despues jsonb,
 transaccion bigint not null default txid_current()
);
create index if not exists auditoria_fecha on private.registro_auditoria(fecha desc,id desc);
create index if not exists auditoria_usuario on private.registro_auditoria(usuario_id,id desc);
alter table private.registro_auditoria enable row level security;
revoke all on private.registro_auditoria from public,anon,authenticated,service_role;
revoke all on sequence private.registro_auditoria_id_seq from public,anon,authenticated,service_role;

-- Solo campos autorizados: nunca JWT, contraseñas, mensajes, comprobantes ni contactos.
create or replace function private.datos_auditables(fila jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb)
 from jsonb_each(coalesce(fila,'{}'::jsonb))
 where key=any(array['id','producto_id','categoria_id','proveedor_id','compra_id','venta_id',
 'lote_id','pedido_id','usuario_id','nombre','rol','activo','presentacion','precio_venta',
 'costo_unitario','precio_unitario','cantidad','cantidad_inicial','cantidad_disponible',
 'cantidad_reservada','costo','precio','total','subtotal','metodo_pago','tipo','estado',
 'fecha','fecha_vencimiento','fecha_recogida','reserva_hasta','retenido','pagado_en',
 'verificado_por','aprobado_por','aprobado_en','demanda_diaria','demanda_anual',
 'plazo_entrega_dias','stock_seguridad','costo_pedido','costo_mantenimiento_anual',
 'capacidad_maxima','vida_util_dias','dias','abre','cierra','anticipacion_min','max_dias',
 'ubicacion_confirmada','nombre_tienda','solicita_atencion','cancelado','vence_en',
 'demanda_fuente','periodo_dias','seguridad_metodo','nivel_servicio','unidades_en_camino',
 'porcentaje_ganancia_sugerido','precio_anterior','precio_nuevo','porcentaje_sugerido']);
$$;
create or replace function private.anotar_auditoria(
 actor uuid, accion text, entidad text, registro text, origen text,
 resultado text default 'confirmado', campos text[] default '{}',
 antes jsonb default null, despues jsonb default null
) returns void language plpgsql security definer set search_path='' as $$
declare perfil public.perfiles_usuarios%rowtype;
begin
 if actor is not null then select * into perfil from public.perfiles_usuarios where id=actor; end if;
 insert into private.registro_auditoria(usuario_id,nombre,rol,accion,entidad,registro,origen,resultado,campos,antes,despues)
 values(actor,coalesce(perfil.nombre,case when actor is null then 'Sistema / cliente de WhatsApp' else 'Usuario no disponible' end),
 coalesce(perfil.rol,'sistema'),accion,entidad,registro,origen,resultado,campos,antes,despues);
end $$;
create or replace function private.capturar_auditoria() returns trigger
language plpgsql security definer set search_path='' as $$
declare a jsonb; d jsonb; original_a jsonb; original_d jsonb; cambios text[]; actor uuid; origen text;
begin
 if tg_op<>'INSERT' then original_a:=to_jsonb(old); a:=private.datos_auditables(original_a); end if;
 if tg_op<>'DELETE' then original_d:=to_jsonb(new); d:=private.datos_auditables(original_d); end if;
 select array_agg(k order by k) into cambios from (
 select jsonb_object_keys(coalesce(original_a,'{}')||coalesce(original_d,'{}')) k) x
 where k not in ('actualizado_en','ultimo_entrante') and original_a->k is distinct from original_d->k;
 if tg_op='UPDATE' and coalesce(cardinality(cambios),0)=0 then return null; end if;
 actor:=nullif(current_setting('app.auditoria_actor',true),'')::uuid;
 origen:=coalesce(nullif(current_setting('app.auditoria_origen',true),''),'base_datos');
 if actor is null and auth.uid() is not null then actor:=auth.uid(); end if;
 perform private.anotar_auditoria(actor,tg_op,tg_table_schema||'.'||tg_table_name,
 coalesce(d->>'id',a->>'id',d->>'producto_id',a->>'producto_id',d->>'pedido_id',a->>'pedido_id'),
 origen,'confirmado',coalesce(cambios,'{}'),a,d);
 return null;
end $$;
create or replace function private.proteger_auditoria() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'El historial de auditoría no admite modificaciones ni borrados.'; end $$;
drop trigger if exists auditoria_inmutable on private.registro_auditoria;
create trigger auditoria_inmutable before update or delete or truncate on private.registro_auditoria
for each statement execute function private.proteger_auditoria();

-- Conservar las funciones actuales y añadir contexto dentro de su misma transacción.
-- Estas RPC son exclusivamente del backend; el navegador no puede suplantar al actor.
do $migration$
declare f record; definicion text; contexto text;
begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('ia_servicio','gestionar_pedido_whatsapp') loop
  if has_function_privilege('authenticated',f.oid,'execute') or has_function_privilege('anon',f.oid,'execute') then
   raise exception 'La RPC % debe ser exclusiva del backend.',f.proname;
  end if;
  definicion:=pg_get_functiondef(f.oid);
  if position('app.auditoria_origen' in definicion)=0 then
   contexto:=case when f.proname='ia_servicio' then
    E'begin\n perform set_config(''app.auditoria_actor'',coalesce(p_usuario::text,''''),true);\n perform set_config(''app.auditoria_origen'',''asistente_ia'',true);'
   else E'begin\n perform set_config(''app.auditoria_actor'',coalesce(p_actor::text,''''),true);\n perform set_config(''app.auditoria_origen'',''pedidos_whatsapp'',true);' end;
   execute regexp_replace(definicion,E'\\mbegin\\M',contexto,'i');
  end if;
 end loop;
end $migration$;

do $migration$
declare tabla text;
begin
 foreach tabla in array array['public.perfiles_usuarios','public.categorias_productos','public.productos',
 'public.proveedores','public.compras','public.detalle_compras','public.lotes_inventario',
 'public.ventas','public.detalle_ventas','public.movimientos_inventario','public.parametros_inventario',
 'private.config_recogida','private.pedidos_whatsapp','private.reservas_pedidos_whatsapp',
 'private.ia_clientes_whatsapp','private.ia_solicitudes_clientes','private.ia_conversaciones',
 'private.ia_operaciones','private.ia_recordatorios','private.cambios_precio_compra',
 'private.comprobantes_pedidos_whatsapp','private.envios_recibos'] loop
  if to_regclass(tabla) is not null then
   execute format('drop trigger if exists registrar_cambio_auditoria on %s',tabla);
   execute format('create trigger registrar_cambio_auditoria after insert or update or delete on %s for each row execute function private.capturar_auditoria()',tabla);
  end if;
 end loop;
end $migration$;

create or replace function private.auditar_acceso() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='sesiones_autorizadas' then
  -- Las sesiones internas temporales de la IA no son accesos de personas.
  if coalesce(current_setting('app.auditoria_origen',true),'')='asistente_ia' then return null; end if;
  if tg_op='INSERT' then
   perform private.anotar_auditoria(new.usuario_id,'INICIAR_SESION','acceso',null,'acceso');
  else
   perform private.anotar_auditoria(old.usuario_id,'REVOCAR_SESION','acceso',null,'acceso');
  end if;
 elsif new.resultado<>'correcto' then
  -- Un correo escrito en un intento fallido no demuestra la identidad de esa persona.
  perform private.anotar_auditoria(null,'ACCESO_FALLIDO','acceso',null,'acceso','fallido');

 end if;
 return null;
end $$;
-- Recuperación usa una función separada porque la tabla no contiene resultado.
create or replace function private.auditar_recuperacion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- La recuperación propia comienza sin autenticar: no acredita la identidad.
 perform private.anotar_auditoria(case when new.solicitado_por<>new.usuario_id then new.solicitado_por else null end,'SOLICITAR_RECUPERACION','acceso',new.usuario_id::text,'acceso');
 return null;
end $$;
drop trigger if exists registrar_acceso_auditoria on private.sesiones_autorizadas;
create trigger registrar_acceso_auditoria after insert or delete on private.sesiones_autorizadas for each row execute function private.auditar_acceso();
drop trigger if exists registrar_intento_auditoria on private.auditoria_acceso;
create trigger registrar_intento_auditoria after insert on private.auditoria_acceso for each row execute function private.auditar_acceso();
drop trigger if exists registrar_recuperacion_auditoria on private.recuperaciones_autorizadas;
create trigger registrar_recuperacion_auditoria after insert or update on private.recuperaciones_autorizadas for each row execute function private.auditar_recuperacion();

create or replace function public.guardar_perfil_auditado(p_actor uuid,p_id uuid,p_perfil jsonb,p_nuevo boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare perfil public.perfiles_usuarios%rowtype;
begin
 if not exists(select 1 from public.perfiles_usuarios where id=p_actor and activo and rol='administrador') then raise exception 'Acceso denegado'; end if;
 perform set_config('app.auditoria_actor',p_actor::text,true);
 perform set_config('app.auditoria_origen','gestion_equipo',true);
 if p_nuevo then
  insert into public.perfiles_usuarios(id,nombre,email,rol,activo)
  values(p_id,p_perfil->>'nombre',p_perfil->>'email',p_perfil->>'rol',(p_perfil->>'activo')::boolean) returning * into perfil;
 else
  if p_actor=p_id and (p_perfil->>'rol'<>'administrador' or not (p_perfil->>'activo')::boolean) then raise exception 'No puedes desactivar tu propia cuenta'; end if;
  update public.perfiles_usuarios set nombre=p_perfil->>'nombre',rol=p_perfil->>'rol',activo=(p_perfil->>'activo')::boolean
  where id=p_id and email=p_perfil->>'email' returning * into perfil;
  if not found then raise exception 'Perfil no disponible'; end if;
 end if;
 return to_jsonb(perfil);
end $$;
revoke all on function public.guardar_perfil_auditado(uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.guardar_perfil_auditado(uuid,uuid,jsonb,boolean) to service_role;

create or replace function public.registrar_evento_interfaz(p_modulo text,p_accion text default 'VISITAR_PANTALLA')
returns void language plpgsql security definer set search_path='' as $$
declare rol text:=public.rol_actual();
begin
 if rol is null then raise exception 'Sesión no autorizada'; end if;
 if p_accion not in ('VISITAR_PANTALLA','CONSULTAR_DETALLE','ABRIR_YCLOUD') then raise exception 'Evento no permitido'; end if;
 if not (p_modulo=any(case rol
 when 'administrador' then array['dashboard','usuarios','categorias','productos','proveedores','compras','inventario','planificacion','ventas','asistente','pedidos','atencion','auditoria']
 when 'cajero' then array['productos','ventas','pedidos']
 when 'almacen' then array['categorias','productos','proveedores','compras','inventario','planificacion'] else array[]::text[] end)) then raise exception 'Módulo no permitido'; end if;
 perform private.anotar_auditoria(auth.uid(),p_accion,p_modulo,null,'interfaz','informado');
end $$;
revoke all on function public.registrar_evento_interfaz(text,text) from public,anon;
grant execute on function public.registrar_evento_interfaz(text,text) to authenticated;

create or replace function public.consultar_auditoria(
 p_desde date default null,p_hasta date default null,p_usuario uuid default null,
 p_accion text default null,p_antes bigint default null,p_limite integer default 100,
 p_exportar boolean default false,p_tope bigint default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare salida jsonb; limite integer:=greatest(1,least(coalesce(p_limite,100),500));
begin
 if public.rol_actual() is distinct from 'administrador' then raise exception 'Solo el administrador puede consultar auditoría'; end if;
 if p_desde>p_hasta then raise exception 'Rango de fechas inválido'; end if;
 if p_exportar then perform private.anotar_auditoria(auth.uid(),'EXPORTAR_LOG','auditoria',null,'base_datos'); end if;
 with seleccion as (
 select * from private.registro_auditoria a where
 (p_desde is null or fecha >= (p_desde::timestamp at time zone 'America/La_Paz')) and
 (p_hasta is null or fecha < ((p_hasta+1)::timestamp at time zone 'America/La_Paz')) and
 (p_usuario is null or usuario_id=p_usuario) and (p_accion is null or accion=p_accion) and
 (p_antes is null or id<p_antes) and (p_tope is null or id<=p_tope)
 order by id desc limit limite+1
 ), pagina as (select * from seleccion order by id desc limit limite)
 select jsonb_build_object('registros',coalesce((select jsonb_agg(to_jsonb(p)-'id'||jsonb_build_object('id',p.id::text) order by p.id desc) from pagina p),'[]'::jsonb),
 'hay_mas',(select count(*)>limite from seleccion)) into salida;
 return salida;
end $$;
revoke all on function public.consultar_auditoria(date,date,uuid,text,bigint,integer,boolean,bigint) from public,anon;
grant execute on function public.consultar_auditoria(date,date,uuid,text,bigint,integer,boolean,bigint) to authenticated;

create or replace function public.atencion_whatsapp_auditada(p_actor uuid,p_telefono text,p_accion text,p_datos jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_accion not in ('humano','reanudar','revisar') or not exists(select 1 from public.perfiles_usuarios where id=p_actor and activo and rol='administrador') then raise exception 'Acceso denegado'; end if;
 perform set_config('app.auditoria_actor',p_actor::text,true);
 perform set_config('app.auditoria_origen','atencion_whatsapp',true);
 return public.ia_atencion_publica(p_telefono,p_accion,p_datos);
end $$;
revoke all on function public.atencion_whatsapp_auditada(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.atencion_whatsapp_auditada(uuid,text,text,jsonb) to service_role;

-- Revocaciones explícitas también para funciones internas SECURITY DEFINER.
revoke all on function private.datos_auditables(jsonb),private.anotar_auditoria(uuid,text,text,text,text,text,text[],jsonb,jsonb),
 private.capturar_auditoria(),private.proteger_auditoria(),private.auditar_acceso(),private.auditar_recuperacion()
 from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
