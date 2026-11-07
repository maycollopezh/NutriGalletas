import test from 'node:test';
import assert from 'node:assert/strict';
import { qrSaleFingerprint,canConfirmQrSale } from '../src/payments.js';
const products=[{id:'avena',precio_venta:6},{id:'cacao',precio_venta:8}];
const cart=[{producto_id:'avena',cantidad:2},{producto_id:'cacao',cantidad:1}];
test('QR requires manual acknowledgement of the current sale, including quantities and prices',()=>{
 assert.equal(canConfirmQrSale(cart,products,''),false);
 const acknowledged=qrSaleFingerprint(cart,products);
 assert.equal(canConfirmQrSale(cart,products,acknowledged),true);
 assert.equal(canConfirmQrSale([{producto_id:'avena',cantidad:3},cart[1]],products,acknowledged),false);
 assert.equal(canConfirmQrSale(cart,[{id:'avena',precio_venta:7},products[1]],acknowledged),false);
 assert.equal(canConfirmQrSale([{producto_id:'avena',cantidad:2}],products,acknowledged),false);
 assert.equal(canConfirmQrSale([],products,acknowledged),false);
});
test('Reordering the same sale preserves its acknowledgement; invalid lines cannot be acknowledged',()=>{
 const acknowledged=qrSaleFingerprint(cart,products);
 assert.equal(canConfirmQrSale([...cart].reverse(),products,acknowledged),true);
 for(const line of [{producto_id:'missing',cantidad:1},{producto_id:'avena',cantidad:0},{producto_id:'avena',cantidad:1.5}]){
   assert.equal(qrSaleFingerprint([line],products),'');
   assert.equal(canConfirmQrSale([line],products,''),false);
 }
});
