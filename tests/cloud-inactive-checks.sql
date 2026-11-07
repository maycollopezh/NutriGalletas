begin;
do $$
declare v_uid uuid; v_sid uuid:=gen_random_uuid(); v_ok boolean; v_n bigint; v_denied boolean:=false;
begin
select id into strict v_uid from public.perfiles_usuarios where email='rebecanancyyana@gmail.com' and rol='cajero' and activo;
insert into private.sesiones_autorizadas(session_id,usuario_id) values(v_sid,v_uid);
update public.perfiles_usuarios set activo=false where id=v_uid;
perform set_config('request.jwt.claims',jsonb_build_object('sub',v_uid::text,'role','authenticated','session_id',v_sid::text)::text,true);
execute 'set local role authenticated';
v_ok := public.rol_actual() is null;
select count(*) into v_n from public.productos;
begin perform public.registrar_venta('[]'::jsonb,'efectivo'); exception when others then v_denied:=sqlerrm='No tienes permiso para vender'; end;
execute 'reset role';
perform set_config('qa.inactivo_sin_rol',v_ok::text,true);
perform set_config('qa.inactivo_sin_datos',(v_n=0)::text,true);
perform set_config('qa.inactivo_sin_ventas',v_denied::text,true);
end $$;
select current_setting('qa.inactivo_sin_rol') as inactivo_sin_rol,current_setting('qa.inactivo_sin_datos') as inactivo_sin_datos,current_setting('qa.inactivo_sin_ventas') as inactivo_sin_ventas;
rollback;
