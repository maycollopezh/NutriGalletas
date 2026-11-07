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

await db.exec(await readFile(new URL('../supabase/003_inventarios_iop.sql', import.meta.url), 'utf8'));
const product=(await db.query("select id from public.productos where codigo='GAL-001'")).rows[0].id;
async function asUser(uid,sid) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claims',$2,false)",[uid,JSON.stringify({sub:uid,session_id:sid})]); await db.exec('set role authenticated'); }
await asUser(admin,adminSession);
check((await db.query('select * from public.parametros_inventario')).rows.length===6,'Administrador consulta los seis parámetros ficticios');
await db.query('update public.parametros_inventario set unidades_en_camino=10 where producto_id=$1',[product]);
check((await db.query('select unidades_en_camino from public.parametros_inventario where producto_id=$1',[product])).rows[0].unidades_en_camino===10,'Administrador modifica parámetros');
for (const [column,value] of [['costo_mantenimiento_anual','0'],['unidades_en_camino','-1'],['periodo_dias','0'],['nivel_servicio','1']]) {
  let rejected=false;try {await db.query(`update public.parametros_inventario set ${column}=${value} where producto_id=$1`,[product]);}catch(e){rejected=e.message.includes('check constraint');} check(rejected,`Base de datos rechaza ${column} inválido`);
}
let rejected=false;try {await db.query("update public.parametros_inventario set seguridad_metodo='estadistico' where producto_id=$1",[product]);}catch(e){rejected=e.message.includes('check constraint');}check(rejected,'Reserva estadística requiere fuente histórica en PostgreSQL');
const demand=(await db.query('select public.consultar_demanda_inventario() as d')).rows[0].d;
check(demand.length>0 && demand.every(r=>Object.keys(r).sort().join(',')==='cantidad,fecha,producto_id'),'RPC solo devuelve fecha, producto y cantidad agregada');
await asUser(warehouse,warehouseSession);
check((await db.query('select * from public.parametros_inventario')).rows.length===6,'Almacén consulta parámetros');
check((await db.query('update public.parametros_inventario set costo_pedido=1 returning *')).rows.length===0,'Almacén no modifica parámetros');
check((await db.query('select public.consultar_demanda_inventario() as d')).rows[0].d.length>0,'Almacén consulta demanda agregada sin acceder a ventas');
check((await db.query('select * from public.ventas')).rows.length===0,'Almacén sigue sin leer las ventas individuales');
const supplier=(await db.query('select id from public.proveedores limit 1')).rows[0].id;
const input={producto_id:product,proveedor_id:supplier,cantidad:3,costo_unitario:4,fecha_vencimiento:'2099-01-01',codigo_lote:'IOP-TRIGGER'};
await db.query('select public.registrar_compra($1::jsonb)',[JSON.stringify(input)]);
check((await db.query('select unidades_en_camino from public.parametros_inventario where producto_id=$1',[product])).rows[0].unidades_en_camino===7,'Recepción descuenta paquetes pendientes atómicamente');
try {await db.query('select public.registrar_compra($1::jsonb)',[JSON.stringify(input)]);}catch{}
check((await db.query('select unidades_en_camino from public.parametros_inventario where producto_id=$1',[product])).rows[0].unidades_en_camino===7,'Compra rechazada no descuenta pendientes');
await db.query('select public.registrar_compra($1::jsonb)',[JSON.stringify({...input,cantidad:20,codigo_lote:'IOP-TRIGGER-2'})]);
check((await db.query('select unidades_en_camino from public.parametros_inventario where producto_id=$1',[product])).rows[0].unidades_en_camino===0,'Recepción nunca deja pendientes negativos');
await asUser(cashier,cashierSession);
check((await db.query('select * from public.parametros_inventario')).rows.length===0,'Cajero no consulta parámetros de costos');
let denied=false;try{await db.query('select public.consultar_demanda_inventario()');}catch(e){denied=e.message.includes('permiso');}check(denied,'Cajero no consulta demanda de otras cuentas por RPC');
await asUser(admin,'10000000-0000-4000-8000-000000000099');
denied=false;try{await db.query('select public.consultar_demanda_inventario()');}catch(e){denied=e.message.includes('permiso');}check(denied,'Sesión no autorizada no consulta planificación');
await db.exec('reset role; set role anon');
denied=false;try{await db.query('select public.consultar_demanda_inventario()');}catch(e){denied=e.message.includes('permission denied');}check(denied,'Acceso anónimo bloqueado');
await db.close(); console.log(`${checks} comprobaciones SQL de inventario correctas en PostgreSQL local.`);
