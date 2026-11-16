-- Ejecutar una sola vez en un proyecto Supabase vacío. No contiene usuarios ni contraseñas.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;
revoke create on schema public from public;

create table public.perfiles_usuarios (
  id uuid primary key references auth.users(id),
  nombre text not null check (length(trim(nombre)) between 2 and 160),
  email text not null unique check (email = lower(trim(email))),
  rol text not null check (rol in ('administrador', 'cajero', 'almacen')),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create table public.categorias_productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) between 2 and 160),
  descripcion text not null default '',
  activo boolean not null default true
);
create unique index categorias_nombre_unico on public.categorias_productos(lower(nombre));
create table public.productos (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references public.categorias_productos(id),
  codigo text not null unique check (length(trim(codigo)) between 1 and 30),
  nombre text not null check (length(trim(nombre)) between 2 and 160),
  presentacion text not null,
  precio_venta numeric(12,2) not null check (precio_venta > 0),
  stock_minimo integer not null default 15 check (stock_minimo >= 0),
  activo boolean not null default true
);
create table public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) between 2 and 160),
  contacto text not null,
  telefono text not null,
  direccion text not null,
  activo boolean not null default true
);
create table public.compras (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references public.proveedores(id),
  usuario_id uuid not null references public.perfiles_usuarios(id),
  fecha timestamptz not null default now(),
  total numeric(14,2) not null check (total > 0),
  observacion text not null default ''
);
create table public.lotes_inventario (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id),
  compra_id uuid not null references public.compras(id),
  codigo_lote text not null check (length(trim(codigo_lote)) between 1 and 160),
  cantidad_inicial integer not null check (cantidad_inicial > 0),
  cantidad_disponible integer not null check (cantidad_disponible >= 0 and cantidad_disponible <= cantidad_inicial),
  costo_unitario numeric(12,2) not null check (costo_unitario > 0),
  fecha_vencimiento date not null,
  unique (producto_id, codigo_lote)
);
create table public.detalle_compras (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references public.compras(id),
  producto_id uuid not null references public.productos(id),
  lote_id uuid not null unique references public.lotes_inventario(id),
  cantidad integer not null check (cantidad > 0),
  costo_unitario numeric(12,2) not null check (costo_unitario > 0)
);
create table public.ventas (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  usuario_id uuid not null references public.perfiles_usuarios(id),
  fecha timestamptz not null default now(),
  metodo_pago text not null check (metodo_pago in ('efectivo', 'qr', 'tarjeta')),
  total numeric(14,2) not null check (total > 0),
  costo_total numeric(14,2) not null check (costo_total > 0)
);
create table public.detalle_ventas (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references public.ventas(id),
  producto_id uuid not null references public.productos(id),
  lote_id uuid not null references public.lotes_inventario(id),
  cantidad integer not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null check (precio_unitario > 0),
  costo_unitario numeric(12,2) not null check (costo_unitario > 0)
);
create table public.gastos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles_usuarios(id),
  concepto text not null check (length(trim(concepto)) between 2 and 160),
  categoria text not null,
  monto numeric(12,2) not null check (monto > 0),
  fecha date not null default (now() at time zone 'America/La_Paz')::date,
  observacion text not null default ''
);
create table public.movimientos_inventario (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes_inventario(id),
  usuario_id uuid not null references public.perfiles_usuarios(id),
  tipo text not null check (tipo in ('compra', 'venta', 'ajuste', 'merma')),
  cantidad integer not null check (cantidad <> 0),
  fecha timestamptz not null default now(),
  referencia_id uuid
);
create index productos_categoria on public.productos(categoria_id);
create index compras_proveedor on public.compras(proveedor_id);
create index lotes_producto_vencimiento on public.lotes_inventario(producto_id, fecha_vencimiento, id);
create index detalle_compras_compra on public.detalle_compras(compra_id);
create index ventas_usuario_fecha on public.ventas(usuario_id, fecha);
create index detalle_ventas_venta on public.detalle_ventas(venta_id);
create index movimientos_lote_fecha on public.movimientos_inventario(lote_id, fecha);
create index gastos_fecha on public.gastos(fecha);

create table private.sesiones_autorizadas (
  session_id uuid primary key,
  usuario_id uuid not null references public.perfiles_usuarios(id),
  creado_en timestamptz not null default now()
);
create table private.contadores_acceso (
  identificador text primary key,
  intentos integer not null default 0,
  inicio_ventana timestamptz not null default now(),
  bloqueado_hasta timestamptz
);
create table private.auditoria_acceso (
  id bigint generated always as identity primary key,
  email text not null,
  resultado text not null,
  fecha timestamptz not null default now()
);
create table private.recuperaciones_autorizadas (
  usuario_id uuid primary key references public.perfiles_usuarios(id),
  vence_en timestamptz not null,
  solicitado_por uuid references public.perfiles_usuarios(id)
);
grant all on all tables in schema private to service_role;
grant usage, select on all sequences in schema private to service_role;

-- A valid Auth JWT is not enough: login must pass the server-side attempt gate.
create function public.rol_actual() returns text language sql stable security definer set search_path = '' as $$
  select p.rol from public.perfiles_usuarios p
  join private.sesiones_autorizadas s on s.usuario_id = p.id
  where p.id = auth.uid() and p.activo
    and s.session_id::text = (auth.jwt() ->> 'session_id')
    and not exists (select 1 from private.contadores_acceso c where c.identificador = 'usuario:' || p.email and c.bloqueado_hasta > now())
$$;
revoke all on function public.rol_actual() from public, anon;
grant execute on function public.rol_actual() to authenticated;

-- Do not grant direct writes to balances or transaction headers/details.
do $$ declare t text; begin
  foreach t in array array['perfiles_usuarios','categorias_productos','productos','proveedores','compras','lotes_inventario','detalle_compras','ventas','detalle_ventas','gastos','movimientos_inventario'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
grant usage, select on all sequences in schema public to service_role;
grant insert, update on public.categorias_productos, public.productos, public.proveedores, public.gastos to authenticated;

create policy usuarios_lectura on public.perfiles_usuarios for select to authenticated
  using (public.rol_actual() = 'administrador' or (public.rol_actual() in ('cajero','almacen') and id = auth.uid()));
create policy categorias_lectura on public.categorias_productos for select to authenticated using (public.rol_actual() is not null);
create policy categorias_crear on public.categorias_productos for insert to authenticated with check (public.rol_actual() in ('administrador','almacen'));
create policy categorias_editar on public.categorias_productos for update to authenticated using (public.rol_actual() in ('administrador','almacen')) with check (public.rol_actual() in ('administrador','almacen'));
create policy productos_lectura on public.productos for select to authenticated using (public.rol_actual() is not null);
create policy productos_crear on public.productos for insert to authenticated with check (public.rol_actual() in ('administrador','almacen'));
create policy productos_editar on public.productos for update to authenticated using (public.rol_actual() in ('administrador','almacen')) with check (public.rol_actual() in ('administrador','almacen'));
create policy proveedores_lectura on public.proveedores for select to authenticated using (public.rol_actual() in ('administrador','almacen'));
create policy proveedores_crear on public.proveedores for insert to authenticated with check (public.rol_actual() in ('administrador','almacen'));
create policy proveedores_editar on public.proveedores for update to authenticated using (public.rol_actual() in ('administrador','almacen')) with check (public.rol_actual() in ('administrador','almacen'));
create policy compras_lectura on public.compras for select to authenticated using (public.rol_actual() in ('administrador','almacen'));
create policy lotes_lectura on public.lotes_inventario for select to authenticated using (public.rol_actual() in ('administrador','almacen'));
create policy detalles_compra_lectura on public.detalle_compras for select to authenticated using (public.rol_actual() in ('administrador','almacen'));
create policy movimientos_lectura on public.movimientos_inventario for select to authenticated using (public.rol_actual() in ('administrador','almacen'));
create policy ventas_lectura on public.ventas for select to authenticated using (public.rol_actual() = 'administrador' or (public.rol_actual() = 'cajero' and usuario_id = auth.uid()));
create policy detalles_venta_lectura on public.detalle_ventas for select to authenticated using (
  public.rol_actual() = 'administrador' or (public.rol_actual() = 'cajero' and exists (select 1 from public.ventas v where v.id = venta_id and v.usuario_id = auth.uid()))
);
create policy gastos_lectura on public.gastos for select to authenticated using (public.rol_actual() = 'administrador');
create policy gastos_crear on public.gastos for insert to authenticated with check (public.rol_actual() = 'administrador' and usuario_id = auth.uid());
create policy gastos_editar on public.gastos for update to authenticated using (public.rol_actual() = 'administrador') with check (public.rol_actual() = 'administrador');

-- Cashiers can obtain quantities without reading suppliers or purchase costs.
create function public.consultar_existencias() returns table(id uuid, producto_id uuid, cantidad_disponible integer, fecha_vencimiento date)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.rol_actual() is null then raise exception 'Acceso no autorizado'; end if;
  return query select l.id, l.producto_id, l.cantidad_disponible, l.fecha_vencimiento from public.lotes_inventario l;
end $$;

-- Serializes all sales of the same product. All lines commit or all roll back.
create function public.registrar_venta(p_items jsonb, p_metodo_pago text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record; v_lote record; v_product public.productos%rowtype; v_sale uuid := gen_random_uuid();
  v_restante integer; v_tomar integer; v_stock bigint; v_total numeric := 0; v_costo numeric := 0;
  v_hoy date := (now() at time zone 'America/La_Paz')::date; v_result jsonb;
begin
  if public.rol_actual() not in ('administrador','cajero') or public.rol_actual() is null then raise exception 'No tienes permiso para vender'; end if;
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
    select coalesce(sum(l.cantidad_disponible),0) into v_stock from public.lotes_inventario l where l.producto_id = r.producto_id and l.fecha_vencimiento >= v_hoy;
    if v_stock < r.cantidad then raise exception 'Stock insuficiente para %', v_product.nombre; end if;
  end loop;
  -- The provisional header is never visible outside this atomic transaction.
  insert into public.ventas(id, usuario_id, metodo_pago, total, costo_total) values (v_sale, auth.uid(), p_metodo_pago, 0.01, 0.01);
  for r in select (value->>'producto_id')::uuid as producto_id, sum((value->>'cantidad')::integer)::integer as cantidad
      from jsonb_array_elements(p_items) group by 1 order by 1 loop
    select * into v_product from public.productos p where p.id = r.producto_id;
    v_restante := r.cantidad;
    for v_lote in select * from public.lotes_inventario l where l.producto_id = r.producto_id and l.cantidad_disponible > 0 and l.fecha_vencimiento >= v_hoy order by l.fecha_vencimiento, l.id for update loop
      exit when v_restante = 0;
      v_tomar := least(v_restante, v_lote.cantidad_disponible);
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

create function public.registrar_compra(p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_compra uuid := gen_random_uuid(); v_lote uuid := gen_random_uuid();
  v_producto uuid := (p_datos->>'producto_id')::uuid; v_proveedor uuid := (p_datos->>'proveedor_id')::uuid;
  v_cantidad integer; v_costo numeric(12,2); v_fecha date := (p_datos->>'fecha_vencimiento')::date;
  v_codigo text := trim(p_datos->>'codigo_lote'); v_result jsonb;
begin
  if public.rol_actual() not in ('administrador','almacen') or public.rol_actual() is null then raise exception 'No tienes permiso para recibir compras'; end if;
  if jsonb_typeof(p_datos->'cantidad') <> 'number' or (p_datos->>'cantidad')::numeric <> trunc((p_datos->>'cantidad')::numeric) then raise exception 'Cantidad inválida'; end if;
  v_cantidad := (p_datos->>'cantidad')::integer; v_costo := (p_datos->>'costo_unitario')::numeric;
  if v_cantidad is null or v_cantidad not between 1 and 100000 or v_costo is null or v_costo <= 0 then raise exception 'Cantidad o costo inválido'; end if;
  if v_fecha is null or v_fecha < (now() at time zone 'America/La_Paz')::date then raise exception 'No se puede recibir un lote vencido'; end if;
  if v_codigo is null or length(v_codigo) = 0 then raise exception 'Falta el código de lote'; end if;
  perform 1 from public.productos where id = v_producto and activo for update;
  if not found then raise exception 'Producto no disponible'; end if;
  perform 1 from public.proveedores where id = v_proveedor and activo;
  if not found then raise exception 'Proveedor no disponible'; end if;
  insert into public.compras(id, proveedor_id, usuario_id, total, observacion) values(v_compra, v_proveedor, auth.uid(), v_cantidad * v_costo, coalesce(p_datos->>'observacion',''));
  insert into public.lotes_inventario(id, compra_id, producto_id, codigo_lote, cantidad_inicial, cantidad_disponible, costo_unitario, fecha_vencimiento)
    values(v_lote, v_compra, v_producto, v_codigo, v_cantidad, v_cantidad, v_costo, v_fecha);
  insert into public.detalle_compras(compra_id, producto_id, lote_id, cantidad, costo_unitario) values(v_compra, v_producto, v_lote, v_cantidad, v_costo);
  insert into public.movimientos_inventario(lote_id, usuario_id, tipo, cantidad, referencia_id) values(v_lote, auth.uid(), 'compra', v_cantidad, v_compra);
  select to_jsonb(c) into v_result from public.compras c where c.id = v_compra; return v_result;
end $$;

-- These functions are callable only by the trusted access Edge Function.
create function public.reservar_intento(p_email text, p_ip_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_key text; v_row private.contadores_acceso%rowtype; v_limite integer; begin
  foreach v_key in array array['usuario:' || p_email, 'ip:' || p_ip_hash] loop
    insert into private.contadores_acceso(identificador) values(v_key) on conflict do nothing;
    select * into v_row from private.contadores_acceso where identificador = v_key for update;
    v_limite := case when v_key like 'usuario:%' then 5 else 30 end;
    if v_row.bloqueado_hasta > now() then return false; end if;
    if (v_row.bloqueado_hasta is not null and v_row.bloqueado_hasta <= now()) or v_row.inicio_ventana < now() - interval '15 minutes' then
      update private.contadores_acceso set intentos = 0, inicio_ventana = now(), bloqueado_hasta = null where identificador = v_key;
      v_row.intentos := 0;
    end if;
    if v_row.intentos >= v_limite then
      update private.contadores_acceso set bloqueado_hasta = now() + interval '15 minutes' where identificador = v_key; return false;
    end if;
    update private.contadores_acceso set intentos = intentos + 1 where identificador = v_key;
  end loop;
  return true;
end $$;
create function public.finalizar_intento(p_email text, p_exito boolean) returns void
language plpgsql security definer set search_path = '' as $$ begin
  if p_exito then
    update private.contadores_acceso set intentos = 0, inicio_ventana = now(), bloqueado_hasta = null where identificador = 'usuario:' || p_email;
  else
    update private.contadores_acceso set bloqueado_hasta = case when intentos >= 5 then now() + interval '15 minutes' else bloqueado_hasta end where identificador = 'usuario:' || p_email;
  end if;
  insert into private.auditoria_acceso(email, resultado) values(p_email, case when p_exito then 'correcto' else 'fallido' end);
end $$;
create function public.autorizar_sesion(p_session_id uuid, p_usuario_id uuid) returns void
language sql security definer set search_path = '' as $$
  insert into private.sesiones_autorizadas(session_id, usuario_id) values(p_session_id, p_usuario_id) on conflict (session_id) do nothing
$$;
create function public.revocar_sesion(p_session_id uuid) returns void language sql security definer set search_path = '' as $$ delete from private.sesiones_autorizadas where session_id = p_session_id $$;
create function public.autorizar_recuperacion(p_usuario_id uuid, p_solicitado_por uuid) returns void
language sql security definer set search_path = '' as $$
  insert into private.recuperaciones_autorizadas(usuario_id, vence_en, solicitado_por) values(p_usuario_id, now() + interval '2 minutes', p_solicitado_por)
  on conflict (usuario_id) do update set vence_en = excluded.vence_en, solicitado_por = excluded.solicitado_por
$$;
create function public.consumir_recuperacion(p_usuario_id uuid) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_id uuid; begin delete from private.recuperaciones_autorizadas where usuario_id = p_usuario_id and vence_en > now() returning usuario_id into v_id; return v_id is not null; end $$;

revoke all on function public.consultar_existencias(), public.registrar_venta(jsonb,text), public.registrar_compra(jsonb) from public, anon;
grant execute on function public.consultar_existencias(), public.registrar_venta(jsonb,text), public.registrar_compra(jsonb) to authenticated;
revoke all on function public.reservar_intento(text,text), public.finalizar_intento(text,boolean), public.autorizar_sesion(uuid,uuid), public.revocar_sesion(uuid), public.autorizar_recuperacion(uuid,uuid), public.consumir_recuperacion(uuid) from public, anon, authenticated;
grant execute on function public.reservar_intento(text,text), public.finalizar_intento(text,boolean), public.autorizar_sesion(uuid,uuid), public.revocar_sesion(uuid), public.autorizar_recuperacion(uuid,uuid), public.consumir_recuperacion(uuid) to service_role;
commit;
