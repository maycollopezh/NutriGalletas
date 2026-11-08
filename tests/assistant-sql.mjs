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

await db.exec(await readFile(new URL('../supabase/004_observaciones_docente.sql',import.meta.url),'utf8'));

await db.exec(await readFile(new URL('../supabase/006_asistente_ia.sql',import.meta.url),'utf8'));

const call=async(action,data={},user=admin,channel='web')=>(await db.query('select public.ia_servicio($1::uuid,$2,$3,$4::jsonb) as r',[user,channel,action,JSON.stringify(data)])).rows[0].r;
const prod=(await db.query("select * from public.productos where codigo='GAL-001'")).rows[0];
await db.exec('set role service_role');
const catalog=await call('catalogo');check(catalog.productos.length===6,'Catálogo usa productos del negocio');
const report=await call('consulta');check(Number.isFinite(Number(report.ingreso))&&Array.isArray(report.rendimiento),'Consulta agregada completa y costos históricos');
const draft=await call('borrador',{tipo:'venta',datos:{items:[{producto_id:prod.id,cantidad:1,precio:Number(prod.precio_venta)}],metodo_pago:'efectivo',efectivo_recibido:10},resumen:'Vender una avena a Bs 6, recibido 10'});
const stock=async()=>{await db.exec('reset role');const r=(await db.query('select sum(cantidad_disponible)::int as n from public.lotes_inventario where producto_id=$1',[prod.id])).rows[0].n;await db.exec('set role service_role');return r;};
const before=await stock();const sale=await call('confirmar',{id:draft.id});check(Number(sale.total)===6&&Number(sale.cambio)===4,'Confirmación reutiliza venta FEFO y vuelto');
const repeat=await call('confirmar',{id:draft.id});check(repeat.id===sale.id&&(await stock())===before-1,'Reintento no duplica venta ni descuento');
let fail=false;try{await call('confirmar',{id:draft.id},admin,'whatsapp');}catch{fail=true;}check(fail,'Borrador no se confirma desde otro canal');
fail=false;try{await call('catalogo',{},cashier);}catch{fail=true;}check(fail,'Cajero no puede invocar el cerebro de administrador');
const changed=await call('borrador',{tipo:'venta',datos:{items:[{producto_id:prod.id,cantidad:1,precio:1}],metodo_pago:'efectivo',efectivo_recibido:10},resumen:'Precio antiguo'});
fail=false;try{await call('confirmar',{id:changed.id});}catch(e){fail=e.message.includes('precio');}check(fail,'Cambio de precio exige un resumen nuevo');
const qr=await call('borrador',{tipo:'venta',datos:{items:[{producto_id:prod.id,cantidad:1,precio:Number(prod.precio_venta)}],metodo_pago:'qr'},resumen:'Venta QR'});
fail=false;try{await call('confirmar',{id:qr.id});}catch(e){fail=e.message.includes('QR');}check(fail,'QR no se confirma sin comprobación humana');await call('confirmar',{id:qr.id,pago_verificado:true});
const supplier=catalog.proveedores[0];const purchase=await call('borrador',{tipo:'compra',datos:{producto_id:prod.id,proveedor_id:supplier.id,cantidad:3,costo_unitario:3,codigo_lote:'IA-TEST',fecha_vencimiento:'2030-01-01'},resumen:'Recibir tres paquetes'});
const received=await call('confirmar',{id:purchase.id});check((await call('confirmar',{id:purchase.id})).id===received.id,'Compra reintentada crea un solo lote');
const expense=await call('borrador',{tipo:'gasto',datos:{concepto:'Transporte IA',categoria:'Transporte',monto:25,fecha:new Date().toISOString().slice(0,10)},resumen:'Gasto 25'});
const g=await call('confirmar',{id:expense.id});check((await call('confirmar',{id:expense.id})).id===g.id,'Gasto confirmado es idempotente');
const cancelled=await call('borrador',{tipo:'recordatorio',datos:{texto:'Comprar',fecha:'2030-01-01T08:00:00-04:00'},resumen:'Recordar compra'});await call('cancelar',{id:cancelled.id});fail=false;try{await call('confirmar',{id:cancelled.id});}catch{fail=true;}check(fail,'Cancelación impide ejecutar');
const remind=await call('borrador',{tipo:'recordatorio',datos:{texto:'Comprar',fecha:'2030-01-01T08:00:00-04:00'},resumen:'Recordar compra'});await call('confirmar',{id:remind.id});check((await call('estado')).recordatorios.length===1,'Recordatorio guardado solo con confirmación');
await call('humano',{estado:'espera_humana'});check((await call('estado',{},admin,'whatsapp')).estado==='espera_humana','Pausa humana se aplica a ambos canales');
await call('humano',{estado:'bot'});
check((await call('evento',{clave:'web:test'})).nuevo&&!(await call('evento',{clave:'web:test'})).nuevo,'Evento entrante tiene reserva única');
check((await call('envio',{clave:'pdf:test',tipo:'pdf'})).nuevo&&!(await call('envio',{clave:'pdf:test',tipo:'pdf'})).nuevo,'Reporte programado no se envía dos veces');
await db.exec('reset role');check((await db.query('select count(*)::int as n from private.sesiones_autorizadas')).rows[0].n===3,'No quedan sesiones temporales del asistente');
for(const role of ['anon','authenticated']){await db.exec('set role '+role);fail=false;try{await call('catalogo');}catch(e){fail=e.message.includes('permission denied');}check(fail,role+' no puede ejecutar RPC de servicio');await db.exec('reset role');}
await db.exec(await readFile(new URL('../supabase/006_asistente_ia.sql',import.meta.url),'utf8'));check(true,'Migración 006 es repetible');
await db.close();console.log(checks+' comprobaciones IA PostgreSQL correctas.');
