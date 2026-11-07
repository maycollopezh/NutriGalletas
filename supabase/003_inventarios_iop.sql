-- Incremento no destructivo. Ejecutar una vez en el proyecto existente.
begin;
create table if not exists public.parametros_inventario (
  producto_id uuid primary key references public.productos(id),
  demanda_fuente text not null default 'manual' check (demanda_fuente in ('manual','historico')),
  demanda_anual numeric(12,2) not null check (demanda_anual between 0.01 and 36500000),
  periodo_dias integer not null check (periodo_dias between 7 and 365),
  costo_pedido numeric(12,2) not null check (costo_pedido between 0.01 and 999999),
  costo_mantenimiento_anual numeric(12,2) not null check (costo_mantenimiento_anual between 0.01 and 999999),
  plazo_entrega_dias integer not null check (plazo_entrega_dias between 1 and 365),
  seguridad_metodo text not null check (seguridad_metodo in ('manual','estadistico')),
  stock_seguridad integer not null check (stock_seguridad between 0 and 100000),
  nivel_servicio numeric(4,3) not null check (nivel_servicio in (0.9,0.95,0.975,0.99)),
  vida_util_dias integer not null check (vida_util_dias between 1 and 3650),
  capacidad_maxima integer not null check (capacidad_maxima between 1 and 100000),
  unidades_en_camino integer not null default 0 check (unidades_en_camino between 0 and 100000),
  supuestos text not null check (length(btrim(supuestos)) between 10 and 500),
  actualizado_en timestamptz not null default now(),
  check (seguridad_metodo <> 'estadistico' or demanda_fuente = 'historico')
);
alter table public.parametros_inventario enable row level security;
revoke all on public.parametros_inventario from public, anon, authenticated;
grant select, insert, update on public.parametros_inventario to authenticated;
grant all on public.parametros_inventario to service_role;
create policy parametros_lectura on public.parametros_inventario for select to authenticated using (public.rol_actual() in ('administrador','almacen'));
create policy parametros_crear on public.parametros_inventario for insert to authenticated with check (public.rol_actual() = 'administrador');
create policy parametros_editar on public.parametros_inventario for update to authenticated using (public.rol_actual() = 'administrador') with check (public.rol_actual() = 'administrador');

-- Solo cantidades agregadas. No expone identidad del cajero, precios ni importes.
create or replace function public.consultar_demanda_inventario() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_hoy date := (now() at time zone 'America/La_Paz')::date;
begin
  if public.rol_actual() is null or public.rol_actual() not in ('administrador','almacen') then raise exception 'No tienes permiso para consultar planificación'; end if;
  return coalesce((select jsonb_agg(to_jsonb(d)) from (
    select dv.producto_id, (v.fecha at time zone 'America/La_Paz')::date as fecha, sum(dv.cantidad)::bigint as cantidad
    from public.detalle_ventas dv join public.ventas v on v.id = dv.venta_id
    where v.fecha >= ((v_hoy - 365)::timestamp at time zone 'America/La_Paz')
      and v.fecha < (v_hoy::timestamp at time zone 'America/La_Paz')
    group by dv.producto_id, (v.fecha at time zone 'America/La_Paz')::date
  ) d), '[]'::jsonb);
end $$;
revoke all on function public.consultar_demanda_inventario() from public, anon;
grant execute on function public.consultar_demanda_inventario() to authenticated;

create or replace function private.actualizar_fecha_parametros() returns trigger language plpgsql set search_path = '' as $$
begin new.actualizado_en := now(); return new; end $$;
create trigger parametros_fecha before update on public.parametros_inventario for each row execute function private.actualizar_fecha_parametros();
create or replace function private.descontar_recepcion_pendiente() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.parametros_inventario set unidades_en_camino = greatest(0,unidades_en_camino-new.cantidad_inicial) where producto_id = new.producto_id and unidades_en_camino > 0;
  return new;
end $$;
revoke all on function private.actualizar_fecha_parametros(), private.descontar_recepcion_pendiente() from public, anon, authenticated;
create trigger recepcion_actualiza_pendiente after insert on public.lotes_inventario for each row execute function private.descontar_recepcion_pendiente();

-- Supuestos académicos para las seis variedades originales, sin alterar stock ni ventas.
insert into public.parametros_inventario (producto_id,demanda_fuente,demanda_anual,periodo_dias,costo_pedido,costo_mantenimiento_anual,plazo_entrega_dias,seguridad_metodo,stock_seguridad,nivel_servicio,vida_util_dias,capacidad_maxima,unidades_en_camino,supuestos)
select id,'manual',1460,30,20,2,3,'manual',6,0.95,60,300,0,
  'Supuestos académicos ficticios: 1460 paquetes/año, pedido Bs 20, mantenimiento Bs 2 por paquete/año, entrega 3 días y reserva 6 paquetes. Revisar vida útil y capacidad.'
from public.productos where codigo in ('GAL-001','GAL-002','GAL-003','GAL-004','GAL-005','GAL-006') on conflict (producto_id) do nothing;
notify pgrst, 'reload schema';
commit;
