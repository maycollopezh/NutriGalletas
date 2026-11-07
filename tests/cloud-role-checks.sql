begin;
create temporary table resultados_roles(prueba text, correcto boolean, detalle text);
grant select,insert on resultados_roles to authenticated;
create temporary table contexto_roles(email text, claims jsonb);
grant select on contexto_roles to authenticated;
insert into contexto_roles
select p.email,jsonb_build_object('sub',p.id::text,'role','authenticated','session_id',gen_random_uuid()::text)
from public.perfiles_usuarios p where p.email in ('rebecanancyyana@gmail.com','jhisselaracely@gmail.com','isaurafernandez67@gmail.com');
insert into private.sesiones_autorizadas(session_id,usuario_id)
select (claims->>'session_id')::uuid,(claims->>'sub')::uuid from contexto_roles;
insert into resultados_roles select 'Tres perfiles con Auth',count(*)=3,'Deben existir los tres perfiles y sus usuarios Auth' from public.perfiles_usuarios p join auth.users u on p.id=u.id where p.email in ('rebecanancyyana@gmail.com','jhisselaracely@gmail.com','isaurafernandez67@gmail.com');
set local role authenticated;
do $$
declare r record; v_producto uuid; v_rechazado boolean; v_error text; v_antes bigint;
begin
for r in select * from contexto_roles where email in ('rebecanancyyana@gmail.com','jhisselaracely@gmail.com') loop
  perform set_config('request.jwt.claims',r.claims::text,true);
  insert into resultados_roles values(r.email||': rol cajero',public.rol_actual()='cajero','Contexto autenticado simulado dentro de SQL');
  insert into resultados_roles select r.email||': ventas ajenas ocultas',count(*)=0,'RLS de ventas' from public.ventas where usuario_id<>auth.uid();
  insert into resultados_roles select r.email||': compras ocultas',count(*)=0,'RLS de compras' from public.compras;
  insert into resultados_roles select r.email||': costos de lotes ocultos',count(*)=0,'RLS de lotes' from public.lotes_inventario;
  insert into resultados_roles select r.email||': gastos ocultos',count(*)=0,'RLS de gastos' from public.gastos;
  insert into resultados_roles select r.email||': solo perfil propio',count(*)=1 and bool_and(id=auth.uid()),'RLS de perfiles' from public.perfiles_usuarios;
  insert into resultados_roles select r.email||': existencias sin costos',count(*)>0,'RPC consultar_existencias' from public.consultar_existencias();
  v_rechazado:=false;
  begin
    update public.perfiles_usuarios set rol='administrador' where id=auth.uid();
  exception when insufficient_privilege then v_rechazado:=true;
  end;
  insert into resultados_roles values(r.email||': no puede elevar su rol',v_rechazado,'Actualización directa rechazada');
end loop;
perform set_config('request.jwt.claims',(select claims::text from contexto_roles where email='rebecanancyyana@gmail.com'),true);
select id into v_producto from public.productos where codigo='GAL-001';
select count(*) into v_antes from public.ventas;
v_rechazado:=false;
begin
  perform public.registrar_venta(jsonb_build_array(jsonb_build_object('producto_id',v_producto,'cantidad',99999)),'efectivo');
exception when others then v_error:=sqlerrm; v_rechazado:=v_error like 'Stock insuficiente%';
end;
insert into resultados_roles values('Sobreventa rechazada',v_rechazado,coalesce(v_error,'Sin rechazo'));
insert into resultados_roles select 'Sobreventa sin cabecera residual',count(*)=v_antes,'Transacción rechazada sin venta nueva' from public.ventas;
v_rechazado:=false; v_error:=null;
begin
  perform public.registrar_venta(jsonb_build_array(jsonb_build_object('producto_id',v_producto,'cantidad',99999),jsonb_build_object('producto_id',v_producto,'cantidad',99999)),'efectivo');
exception when others then v_error:=sqlerrm; v_rechazado:=v_error like 'Stock insuficiente%';
end;
insert into resultados_roles values('Líneas duplicadas no evitan control de stock',v_rechazado,coalesce(v_error,'Sin rechazo'));
v_rechazado:=false; v_error:=null;
begin
  perform public.registrar_venta(jsonb_build_array(jsonb_build_object('producto_id',v_producto,'cantidad',0.5)),'efectivo');
exception when others then v_error:=sqlerrm; v_rechazado:=v_error='Cantidad inválida';
end;
insert into resultados_roles values('Cantidad fraccionaria rechazada',v_rechazado,coalesce(v_error,'Sin rechazo'));
perform set_config('request.jwt.claims',(select claims::text from contexto_roles where email='isaurafernandez67@gmail.com'),true);
insert into resultados_roles values('Isaura: rol almacén',public.rol_actual()='almacen','Contexto autenticado simulado dentro de SQL');
insert into resultados_roles select 'Almacén: compras visibles',count(*)>0,'RLS de compras' from public.compras;
insert into resultados_roles select 'Almacén: lotes visibles',count(*)>0,'RLS de lotes' from public.lotes_inventario;
insert into resultados_roles select 'Almacén: ventas ocultas',count(*)=0,'RLS de ventas' from public.ventas;
insert into resultados_roles select 'Almacén: gastos ocultos',count(*)=0,'RLS de gastos' from public.gastos;
v_rechazado:=false; v_error:=null;
begin
  perform public.registrar_venta(jsonb_build_array(jsonb_build_object('producto_id',v_producto,'cantidad',1)),'efectivo');
exception when others then v_error:=sqlerrm; v_rechazado:=v_error='No tienes permiso para vender';
end;
insert into resultados_roles values('Almacén no registra ventas',v_rechazado,coalesce(v_error,'Sin rechazo'));
perform set_config('request.jwt.claims',jsonb_set((select claims from contexto_roles where email='rebecanancyyana@gmail.com'),'{session_id}',to_jsonb(gen_random_uuid()::text))::text,true);
insert into resultados_roles values('Sesión sin autorización no obtiene rol',public.rol_actual() is null,'Claims sin sesión autorizada');
insert into resultados_roles select 'Sesión sin autorización no ve productos',count(*)=0,'RLS con sesión no autorizada' from public.productos;
end $$;
reset role;
select prueba,correcto,detalle from resultados_roles order by prueba;
rollback;
