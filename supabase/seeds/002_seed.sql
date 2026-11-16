-- Opcional: datos ficticios. Ejecutar una sola vez, después de crear el administrador.
-- No crea usuarios Auth ni usa contraseñas ficticias.
begin;
do $$
declare
  v_admin uuid; v_cajero uuid; v_cat uuid; v_prov uuid; v_producto uuid;
  v_compra uuid; v_lote uuid; v_venta uuid; v_dia integer; r record;
  v_hoy date := (now() at time zone 'America/La_Paz')::date;
  v_qty integer; v_cantidad integer; v_precio numeric; v_costo numeric;
begin
  select id into v_admin from public.perfiles_usuarios where rol = 'administrador' and activo order by creado_en limit 1;
  if v_admin is null then raise exception 'Primero debes crear el perfil del administrador'; end if;
  if exists(select 1 from public.productos) then raise exception 'La carga de ejemplo requiere el catálogo vacío'; end if;
  select id into v_cajero from public.perfiles_usuarios where rol = 'cajero' and activo order by creado_en limit 1;
  v_cajero := coalesce(v_cajero, v_admin);
  insert into public.categorias_productos(nombre, descripcion) values ('Integrales','Galletas nutritivas en paquetes'),('Con semillas','Galletas nutritivas en paquetes'),('Sin azúcar añadida','Galletas nutritivas en paquetes');
  insert into public.proveedores(nombre, contacto, telefono, direccion) values ('Distribuidora Illimani (ficticia)','Ana Quispe','70000001','Zona Villa Fátima, La Paz'),('Sabores Andinos (ficticia)','Luis Mamani','70000002','Zona Miraflores, La Paz');
  for r in select * from (values
    (1,'Avena y miel','Integrales',6.00,3.50),
    (2,'Quinua y cacao','Con semillas',8.00,4.80),
    (3,'Chía y linaza','Sin azúcar añadida',7.50,4.20),
    (4,'Coco integral','Integrales',7.00,4.00),
    (5,'Amaranto y canela','Con semillas',8.50,5.00),
    (6,'Avena sin azúcar','Sin azúcar añadida',7.00,4.10)
  ) as x(n,nombre,categoria,precio,costo) loop
    select id into v_cat from public.categorias_productos where nombre = r.categoria;
    select id into v_prov from public.proveedores where nombre = case when r.n % 2 = 0 then 'Sabores Andinos (ficticia)' else 'Distribuidora Illimani (ficticia)' end;
    v_qty := case when r.n = 1 then 28 else 100 end;
    insert into public.productos(categoria_id,codigo,nombre,presentacion,precio_venta,stock_minimo) values(v_cat,'GAL-' || lpad(r.n::text,3,'0'),r.nombre,'Paquete de 100 g',r.precio,15) returning id into v_producto;
    insert into public.compras(proveedor_id,usuario_id,fecha,total,observacion) values(v_prov,v_admin,((v_hoy-25)::text || ' 14:00:00-04')::timestamptz,v_qty*r.costo,'Datos ficticios para evaluación académica') returning id into v_compra;
    insert into public.lotes_inventario(producto_id,compra_id,codigo_lote,cantidad_inicial,cantidad_disponible,costo_unitario,fecha_vencimiento) values(v_producto,v_compra,'LP-2026-' || r.n || 'A',v_qty,v_qty,r.costo,v_hoy + case when r.n = 2 then 10 else 60 end) returning id into v_lote;
    insert into public.detalle_compras(compra_id,producto_id,lote_id,cantidad,costo_unitario) values(v_compra,v_producto,v_lote,v_qty,r.costo);
    insert into public.movimientos_inventario(lote_id,usuario_id,tipo,cantidad,fecha,referencia_id) values(v_lote,v_admin,'compra',v_qty,((v_hoy-25)::text || ' 14:00:00-04')::timestamptz,v_compra);
  end loop;
  for v_dia in -20..0 loop
    select p.id,p.precio_venta,l.id,l.costo_unitario into v_producto,v_precio,v_lote,v_costo from public.productos p join public.lotes_inventario l on l.producto_id=p.id where p.codigo='GAL-' || lpad((((v_dia+20)%5)+1)::text,3,'0');
    v_cantidad := 2 + ((v_dia+20)%4);
    insert into public.ventas(usuario_id,fecha,metodo_pago,total,costo_total) values(v_cajero,((v_hoy+v_dia)::text || ' 15:30:00-04')::timestamptz,case when v_dia%2=0 then 'efectivo' else 'qr' end,v_cantidad*v_precio,v_cantidad*v_costo) returning id into v_venta;
    insert into public.detalle_ventas(venta_id,producto_id,lote_id,cantidad,precio_unitario,costo_unitario) values(v_venta,v_producto,v_lote,v_cantidad,v_precio,v_costo);
    update public.lotes_inventario set cantidad_disponible=cantidad_disponible-v_cantidad where id=v_lote;
    insert into public.movimientos_inventario(lote_id,usuario_id,tipo,cantidad,fecha,referencia_id) values(v_lote,v_cajero,'venta',-v_cantidad,((v_hoy+v_dia)::text || ' 15:30:00-04')::timestamptz,v_venta);
  end loop;
  select id into v_producto from public.productos where codigo='GAL-006';
  select id into v_prov from public.proveedores order by nombre limit 1;
  insert into public.compras(proveedor_id,usuario_id,fecha,total,observacion) values(v_prov,v_admin,((v_hoy-45)::text || ' 14:00:00-04')::timestamptz,32.80,'Lote recibido hace 45 días; ejemplo de vencimiento') returning id into v_compra;
  insert into public.lotes_inventario(producto_id,compra_id,codigo_lote,cantidad_inicial,cantidad_disponible,costo_unitario,fecha_vencimiento) values(v_producto,v_compra,'LP-VENCIDO-EJEMPLO',8,8,4.10,v_hoy-2) returning id into v_lote;
  insert into public.detalle_compras(compra_id,producto_id,lote_id,cantidad,costo_unitario) values(v_compra,v_producto,v_lote,8,4.10);
  insert into public.movimientos_inventario(lote_id,usuario_id,tipo,cantidad,fecha,referencia_id) values(v_lote,v_admin,'compra',8,((v_hoy-45)::text || ' 14:00:00-04')::timestamptz,v_compra);
  insert into public.gastos(usuario_id,concepto,categoria,monto,fecha,observacion) values(v_admin,'Transporte de mercadería','Transporte',25,v_hoy-2,'Viaje dentro de La Paz'),(v_admin,'Bolsas para entrega en tienda','Materiales',12,v_hoy,'');
end $$;
commit;
