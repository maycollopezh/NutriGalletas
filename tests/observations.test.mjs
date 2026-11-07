import test from 'node:test';
import assert from 'node:assert/strict';
import { cashSettlement,saleLots,replenishment } from '../src/operations.js';
import { registerSale,today } from '../src/domain.js';
import { inventoryDefaults } from '../src/inventory.js';
const admin={id:'admin',rol:'administrador',activo:true};
function fixture(){return {productos:[{id:'p',nombre:'Galleta',precio_venta:6,activo:true}],lotes_inventario:[{id:'old',codigo_lote:'A',producto_id:'p',cantidad_disponible:2,cantidad_inicial:2,costo_unitario:3,fecha_vencimiento:'2099-01-01'},{id:'new',codigo_lote:'B',producto_id:'p',cantidad_disponible:5,cantidad_inicial:5,costo_unitario:4,fecha_vencimiento:'2099-02-01'},{id:'expired',producto_id:'p',cantidad_disponible:100,fecha_vencimiento:'2000-01-01'}],ventas:[],detalle_ventas:[],movimientos_inventario:[],parametros_inventario:[{...inventoryDefaults(),producto_id:'p'}]};}
test('Cash refuses insufficient/invalid precision amounts and computes exact cents',()=>{
 for(const amount of ['', '12.001','NaN','0','-1','11.99','1e4'])assert.equal(cashSettlement(12,amount).valid,false);
 assert.deepEqual(cashSettlement(.3,'0.50'),{valid:true,received:.5,change:.2,message:''});
 assert.equal(cashSettlement(12,'20').change,8);
});
test('Invalid cash payment leaves sale and stock untouched; receipt keeps the original change',()=>{
 const d=fixture(),before=structuredClone(d);
 assert.throws(()=>registerSale(d,admin,[{producto_id:'p',cantidad:3}],'efectivo',undefined,{efectivo_recibido:17}),/efectivo/);
 assert.deepEqual(d,before);
 const v=registerSale(d,admin,[{producto_id:'p',cantidad:3}],'efectivo',undefined,{efectivo_recibido:20});
 assert.equal(v.cambio,2);d.productos[0].precio_venta=50;assert.equal(v.total,18);assert.equal(v.cambio,2);
});
test('FEFO preview is read-only and agrees with actual lot dispatch including split products',()=>{
 const d=fixture(),items=[{producto_id:'p',cantidad:1},{producto_id:'p',cantidad:2}],before=structuredClone(d);
 const preview=saleLots(d,items);assert.deepEqual(d,before);assert.deepEqual(preview.map(l=>[l.lote_id,l.cantidad]),[['old',2],['new',1]]);
 registerSale(d,admin,items,'qr');assert.deepEqual(d.detalle_ventas.map(l=>[l.lote_id,l.cantidad]),preview.map(l=>[l.lote_id,l.cantidad]));
 assert.throws(()=>saleLots(d,[{producto_id:'p',cantidad:5}]),/existencias/);
});
test('All screens use the computed threshold, not the obsolete manual product field',()=>{
 const d=fixture();d.productos[0].stock_minimo=999;
 const p=replenishment(d,d.productos[0]);assert.equal(p.minimum,18);assert.equal(p.daily,4);
 d.resumen_inventario=[{producto_id:'p',configurado:true,minimo_reposicion:9,demanda_diaria:1,demanda_fuente:'historico',periodo_dias:30,reserva:6,reponer:false}];
 assert.equal(replenishment(d,d.productos[0]).minimum,9);
});
