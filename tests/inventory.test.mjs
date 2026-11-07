import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryDefaults, inventoryPlan, validateInventoryParameters, aggregateDailySales, shiftInventoryDay } from '../src/inventory.js';
import { canAccess } from '../src/domain.js';
import { planningView, planningForm } from '../src/inventory-view.js';
import { CloudStore } from '../src/supabase.js';
const day='2026-10-20', product={id:'p',nombre:'Avena',codigo:'GAL-001',activo:true};
const fixture=()=>({productos:[product],parametros_inventario:[],lotes_inventario:[{producto_id:'p',cantidad_disponible:20,fecha_vencimiento:'2027-01-01'}],ventas:[],detalle_ventas:[]});
test('EOQ minimizes integer annual cost and uses annual holding cost, not purchase price',()=>{
  const r=inventoryPlan(fixture(),product,{...inventoryDefaults(),demanda_anual:1200},day);
  assert.equal(r.eoq,155); assert.ok(Math.abs(r.exact-Math.sqrt(24000))<1e-9);
  assert.ok(r.costComparisons[1].cost<r.costComparisons[0].cost&&r.costComparisons[1].cost<r.costComparisons[2].cost);
});
test('Reorder, coverage and position include pending orders without treating them as available stock',()=>{
  const p=inventoryDefaults(), data=fixture();data.lotes_inventario[0].cantidad_disponible=10;
  const r=inventoryPlan(data,product,p,day);assert.equal(r.reorder,18);assert.equal(r.coverage,2.5);assert.equal(r.suggested,171);
  const pending=inventoryPlan(data,product,{...p,unidades_en_camino:20},day);assert.equal(pending.position,30);assert.equal(pending.coverage,2.5);assert.equal(pending.suggested,0);assert.equal(pending.status,'Pedido en camino');
});
test('Equality triggers reorder, expired lots never inflate coverage',()=>{
  const data=fixture();data.lotes_inventario[0].cantidad_disponible=18;data.lotes_inventario.push({producto_id:'p',cantidad_disponible:100,fecha_vencimiento:'2026-10-19'});
  const r=inventoryPlan(data,product,inventoryDefaults(),day);assert.equal(r.stock,18);assert.equal(r.needsOrder,true);assert.equal(r.coverage,4.5);
});
test('Historical demand includes calendar days with zero sales and excludes current day using Bolivia dates',()=>{
  const data=fixture();data.ventas=[{id:'y',fecha:'2026-10-20T02:00:00Z'},{id:'t',fecha:'2026-10-20T15:00:00Z'}];data.detalle_ventas=[{venta_id:'y',producto_id:'p',cantidad:14},{venta_id:'t',producto_id:'p',cantidad:100}];
  assert.equal(aggregateDailySales(data,day)[0].fecha,'2026-10-19');
  const r=inventoryPlan(data,product,{...inventoryDefaults(),demanda_fuente:'historico',periodo_dias:7},day);assert.equal(r.daily,2);assert.equal(r.annual,730);assert.equal(r.historyUnits,14);assert.equal(r.activeDays,1);
});
test('No sales means insufficient demand, never Infinity or fabricated coverage',()=>{
  const r=inventoryPlan(fixture(),product,{...inventoryDefaults(),demanda_fuente:'historico'},day);assert.equal(r.eoq,null);assert.equal(r.coverage,null);assert.equal(r.suggested,0);
});
test('Statistical safety uses sample daily deviation, z and square root of constant lead time',()=>{
  const data=fixture();data.demanda_inventario=Array.from({length:7},(_,i)=>({producto_id:'p',fecha:shiftInventoryDay(day,-7+i),cantidad:i%2?2:0}));
  const p={...inventoryDefaults(),demanda_fuente:'historico',seguridad_metodo:'estadistico',periodo_dias:7,plazo_entrega_dias:4};const r=inventoryPlan(data,product,p,day);
  const mean=6/7, sd=Math.sqrt(([0,2,0,2,0,2,0].reduce((s,v)=>s+(v-mean)**2,0))/6);
  assert.ok(Math.abs(r.deviation-sd)<1e-9);assert.equal(r.safety,Math.ceil(1.644853627*sd*2));
});
test('Capacity and shelf life constrain practical order while theoretical EOQ remains visible',()=>{
  const data=fixture();data.lotes_inventario[0].cantidad_disponible=10;
  const r=inventoryPlan(data,product,{...inventoryDefaults(),capacidad_maxima:40,vida_util_dias:6},day);assert.equal(r.eoq,171);assert.equal(r.suggested,14);
  assert.equal(inventoryPlan(data,product,{...inventoryDefaults(),capacidad_maxima:5},day).suggested,0);
});
test('Invalid model inputs fail before calculation, with no hidden defaults',()=>{
  for(const patch of [{costo_pedido:0},{costo_mantenimiento_anual:-1},{demanda_anual:NaN},{periodo_dias:0},{stock_seguridad:-1},{plazo_entrega_dias:1.5},{unidades_en_camino:-1},{vida_util_dias:0},{capacidad_maxima:0},{supuestos:' '},{nivel_servicio:1},{seguridad_metodo:'estadistico',demanda_fuente:'manual'}]) assert.throws(()=>validateInventoryParameters({...inventoryDefaults(),...patch}));
  assert.equal(inventoryPlan(fixture(),product,null,day).configured,false);
});
test('Only administrator and warehouse can access planning; warehouse has no parameter edit controls',()=>{
  for(const rol of ['administrador','almacen'])assert.equal(canAccess({rol,activo:true},'planificacion'),true);
  assert.equal(canAccess({rol:'cajero',activo:true},'planificacion'),false);
  const data=fixture();data.parametros_inventario=[{...inventoryDefaults(),producto_id:'p'}];
  assert.ok(!planningView(data,{rol:'almacen'}).includes('data-action="plan-edit"'));
  assert.ok(planningView(data,{rol:'administrador'}).includes('data-action="plan-edit"'));
});
test('Assumptions and product names are escaped in planning table and parameter form',()=>{
  const data=fixture();data.productos=[{...product,nombre:'<script>alert(1)</script>'}];data.parametros_inventario=[{...inventoryDefaults(),producto_id:'p',supuestos:'<img src=x onerror=alert(1)>'}];
  assert.ok(!planningView(data,{rol:'administrador'}).includes('<script>'));
  const detail=planningForm(data,'p');assert.ok(!detail.includes('<img'));assert.ok(detail.includes('&lt;img'));
});
test('Cloud loading uses the parameter primary key and only requests aggregated demand for authorized roles',async()=>{
  for(const rol of ['administrador','almacen','cajero']) {
    const calls=[];const store=new CloudStore();store.user={rol};
    store.client={from(table){calls.push(table);return {select(){return this;},order(key){assert.equal(key,table==='parametros_inventario'?'producto_id':'id');return this;},async range(){return {data:[],error:null};}};},async rpc(name){calls.push(name);return {data:[],error:null};}};
    const data=await store.load();assert.ok(Array.isArray(data.parametros_inventario));
    assert.equal(calls.includes('consultar_demanda_inventario'),rol!=='cajero');
    assert.equal(calls.includes('parametros_inventario'),rol!=='cajero');
  }
});
test('A pending cloud migration does not disable existing administration or silently calculate from partial data',async()=>{
  const store=new CloudStore();store.user={rol:'administrador'};
  store.client={from(table){return {select(){return this;},order(){return this;},async range(){return table==='parametros_inventario'?{data:null,error:{code:'PGRST205',message:'missing'}}:{data:[],error:null};}};},async rpc(){assert.fail('Do not request statistics until migration is ready');}};
  const data=await store.load();assert.equal(data.planificacion_pendiente,true);assert.ok(Array.isArray(data.productos));
  const view=planningView(data,{rol:'administrador'});assert.ok(view.includes('Falta activar'));assert.ok(!view.includes('data-action="plan-edit"'));
});
test('Cloud table reads start concurrently while pagination within a table remains ordered',async()=>{
  const store=new CloudStore();store.user={rol:'administrador'};const started=[], release=[];
  store.client={from(table){return {select(){return this;},order(){return this;},range(){started.push(table);return new Promise(resolve=>release.push(()=>resolve({data:[],error:null})));}};},async rpc(){return {data:[],error:null};}};
  const loading=store.load();assert.equal(started.length,12);
  release.forEach(resolve=>resolve());await loading;
});
