import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const db = new PGlite();
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; console.log('✓ ' + message); };
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
  grant usage on schema public, auth to authenticated;
  grant execute on function auth.uid(), auth.jwt() to authenticated;
`);
const admin = '00000000-0000-4000-8000-000000000001';
const cashier = '00000000-0000-4000-8000-000000000002';
const warehouse = '00000000-0000-4000-8000-000000000003';
const adminSession = '10000000-0000-4000-8000-000000000001';
const cashierSession = '10000000-0000-4000-8000-000000000002';
const warehouseSession = '10000000-0000-4000-8000-000000000003';
await db.exec(await readFile(new URL('../supabase/001_schema.sql', import.meta.url), 'utf8'));
await db.exec(`insert into auth.users values ('${admin}'),('${cashier}'),('${warehouse}');
  insert into public.perfiles_usuarios(id,nombre,email,rol) values ('${admin}','Administrador','admin@example.test','administrador'),('${cashier}','Cajero','cajero@example.test','cajero'),('${warehouse}','Almacén','almacen@example.test','almacen');
  select public.autorizar_sesion('${adminSession}','${admin}');
  select public.autorizar_sesion('${cashierSession}','${cashier}');
  select public.autorizar_sesion('${warehouseSession}','${warehouse}');
`);
await db.exec(await readFile(new URL('../supabase/002_seed.sql', import.meta.url), 'utf8'));
const [{ rows: integrity }] = await db.exec(`select count(*) as inconsistencias from public.lotes_inventario l where l.cantidad_disponible <> coalesce((select sum(m.cantidad) from public.movimientos_inventario m where m.lote_id=l.id),0)`);
check(Number(integrity[0].inconsistencias) === 0, 'Datos ficticios: todos los saldos coinciden con sus movimientos');
const product = (await db.query(`select id from public.productos where codigo='GAL-001'`)).rows[0].id;
async function asUser(userId, sessionId) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)", [userId, JSON.stringify({ sub: userId, session_id: sessionId })]);
  await db.exec('set role authenticated');
}
await asUser(admin, adminSession);
const beforeStock = (await db.query(`select cantidad_disponible from public.lotes_inventario where producto_id=$1`, [product])).rows[0].cantidad_disponible;
const sale = (await db.query(`select public.registrar_venta($1::jsonb,'qr') as venta`, [JSON.stringify([{ producto_id: product, cantidad: 2 }])])).rows[0].venta;
check(Number(sale.total) === 12 && Number(sale.costo_total) === 7, 'Venta SQL conserva precio y costo históricos correctos');
check((await db.query(`select cantidad_disponible from public.lotes_inventario where producto_id=$1`, [product])).rows[0].cantidad_disponible === beforeStock - 2, 'La transacción SQL descuenta el inventario');
const salesBefore = (await db.query('select count(*) as n from public.ventas')).rows[0].n;
try { await db.query(`select public.registrar_venta($1::jsonb,'qr')`, [JSON.stringify([{ producto_id: product, cantidad: 6 }, { producto_id: product, cantidad: 6 }])]); assert.fail('Debía fallar'); } catch (e) { check(e.message.includes('Stock insuficiente'), 'La suma de líneas repetidas impide sobreventa'); }
check((await db.query('select count(*) as n from public.ventas')).rows[0].n === salesBefore, 'Venta rechazada no deja cabecera ni descuento parcial');
try { await db.query(`select public.registrar_venta($1::jsonb,'qr')`, [JSON.stringify([{ producto_id: product, cantidad: 1.5 }])]); assert.fail('Debía fallar'); } catch (e) { check(e.message.includes('Cantidad inválida'), 'RPC rechaza cantidades fraccionarias'); }
await asUser(cashier, cashierSession);
const ownSales = (await db.query('select * from public.ventas')).rows;
check(ownSales.every(v => v.usuario_id === cashier) && !ownSales.some(v => v.id === sale.id), 'RLS: el cajero solo consulta sus propias ventas');
check((await db.query('select * from public.proveedores')).rows.length === 0, 'RLS: cajero no obtiene datos de proveedores');
check((await db.query('select * from public.lotes_inventario')).rows.length === 0, 'RLS: cajero no obtiene costos de compras');
check((await db.query('select * from public.consultar_existencias()')).rows.length > 0, 'Cajero sí consulta cantidades mediante función restringida');
try { await db.query('update public.lotes_inventario set cantidad_disponible=999'); assert.fail('Debía fallar'); } catch (e) { check(e.message.includes('permission denied'), 'No se permite modificar saldos directamente'); }
try { await db.query("update public.perfiles_usuarios set rol='administrador' where id=$1", [cashier]); assert.fail('Debía fallar'); } catch (e) { check(e.message.includes('permission denied'), 'Un usuario no puede ascender su propio rol'); }
await asUser(warehouse, warehouseSession);
check((await db.query('select * from public.ventas')).rows.length === 0, 'Almacén no consulta ventas');
try { await db.query(`select public.registrar_venta($1::jsonb,'qr')`, [JSON.stringify([{ producto_id: product, cantidad: 1 }])]); assert.fail('Debía fallar'); } catch (e) { check(e.message.includes('permiso'), 'Almacén no registra ventas'); }
const supplier = (await db.query('select id from public.proveedores limit 1')).rows[0].id;
const purchase = (await db.query('select public.registrar_compra($1::jsonb) as compra', [JSON.stringify({ producto_id: product, proveedor_id: supplier, cantidad: 3, costo_unitario: 4, fecha_vencimiento: '2099-01-01', codigo_lote: 'TEST-NEW' })])).rows[0].compra;
check(Number(purchase.total) === 12, 'Compra SQL crea cabecera, lote y detalle con total correcto');
await asUser(cashier, '10000000-0000-4000-8000-000000000099');
check((await db.query('select public.rol_actual() as rol')).rows[0].rol === null && (await db.query('select * from public.productos')).rows.length === 0, 'JWT sin sesión autorizada no puede saltarse el control de intentos');
await db.exec('reset role');
for (let i = 0; i < 5; i++) { await db.query("select public.reservar_intento('admin@example.test','test-ip')"); await db.query("select public.finalizar_intento('admin@example.test',false)"); }
check((await db.query("select public.reservar_intento('admin@example.test','test-ip') as permitido")).rows[0].permitido === false, 'Cinco intentos fallidos activan bloqueo en el servidor');
await asUser(admin, adminSession);
check((await db.query('select public.rol_actual() as rol')).rows[0].rol === null, 'Una cuenta bloqueada tampoco obtiene datos usando un JWT existente');
await db.exec('reset role');
await db.query('select public.autorizar_recuperacion($1,$1)', [admin]);
check((await db.query('select public.consumir_recuperacion($1) as autorizado', [admin])).rows[0].autorizado === true && (await db.query('select public.consumir_recuperacion($1) as autorizado', [admin])).rows[0].autorizado === false, 'Permiso de recuperación de un solo uso');
await db.close();
console.log(`\n${checks} comprobaciones PostgreSQL correctas. Auth/Edge/correo reales pendientes de validar en Supabase.`);
