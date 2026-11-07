import test from 'node:test';
import assert from 'node:assert/strict';
import {validateImageFile,safeImageUrl} from '../src/images.js';
import {productPhoto} from '../src/visuals.js';
import {CloudStore} from '../src/supabase.js';
import {DemoStore} from '../src/store.js';
test('Rechaza archivos vacíos, SVG, HTML y fotos superiores a 5 MB',()=>{
 for(const f of [{type:'image/svg+xml',size:10},{type:'text/html',size:10},{type:'image/jpeg',size:0},{type:'image/png',size:5242881}])assert.throws(()=>validateImageFile(f));
 assert.doesNotThrow(()=>validateImageFile({type:'image/webp',size:1000}));
});
test('La foto se renderiza como imagen escapada sin aceptar URLs ejecutables',()=>{
 assert.equal(safeImageUrl('javascript:alert(1)'), '');assert.equal(safeImageUrl('data:image/svg+xml;base64,AAA='),'');
 const html=productPhoto({nombre:'Galleta "<x>',imagen_url:'https://example.test/foto.jpg?x=1&y=2'});
 assert.match(html,/<img/);assert.match(html,/&amp;y/);assert.doesNotMatch(html,/<x>/);
});
function mockStore({uploadError=null,saveError=null,role='administrador'}={}){
 const calls=[];const store=new CloudStore();store.user={id:'user-1',rol:role};
 store.client={storage:{from:()=>({upload:async(path,blob)=>{calls.push(['upload',path]);return {error:uploadError};},remove:async(paths)=>{calls.push(['remove',paths]);return{};}})},from:()=>({insert:values=>{calls.push(['insert',values]);return{select:()=>({single:async()=>({data:values,error:saveError})})};}})};
 return {store,calls};
}
test('Carga la foto antes de guardar y persiste solo su ruta privada',async()=>{
 const {store,calls}=mockStore();const saved=await store.save('productos',{nombre:'Foto'},undefined,{blob:new Blob(['jpg'])});
 assert.match(saved.imagen_ruta,/^productos\/user-1\/.+\.jpg$/);assert.deepEqual(calls.map(c=>c[0]),['upload','insert']);assert.equal(saved.blob,undefined);
});
test('Si falla la carga no se guarda un producto con foto inexistente',async()=>{
 const {store,calls}=mockStore({uploadError:new Error('falló')});await assert.rejects(store.save('productos',{},undefined,{blob:new Blob()}));assert.deepEqual(calls.map(c=>c[0]),['upload']);
});
test('Si falla el formulario se retira la foto que se acababa de subir',async()=>{
 const {store,calls}=mockStore({saveError:new Error('código repetido')});await assert.rejects(store.save('productos',{},undefined,{blob:new Blob()}),/código repetido/);assert.deepEqual(calls.map(c=>c[0]),['upload','insert','remove']);
});
test('Cajero no puede cargar fotos y retirar una foto no borra otras imágenes',async()=>{
 const denied=mockStore({role:'cajero'});await assert.rejects(denied.store.save('productos',{},undefined,{blob:new Blob()}),/permisos/);assert.equal(denied.calls.length,0);
 const {store,calls}=mockStore();const saved=await store.save('categorias_productos',{},undefined,{remove:true});assert.equal(saved.imagen_ruta,null);assert.deepEqual(calls.map(c=>c[0]),['insert']);
});
test('En demostración la foto persiste al volver a abrir el almacenamiento',async()=>{
 let state;globalThis.localStorage={getItem:()=>state,setItem:(_,v)=>{state=v;}};
 const store=new DemoStore();await store.loginDemo(store.data.perfiles_usuarios.find(u=>u.rol==='administrador').id);
 const category=await store.save('categorias_productos',{nombre:'Foto prueba',descripcion:'',activo:true},undefined,{dataUrl:'data:image/jpeg;base64,AAAA'});
 assert.equal(new DemoStore().data.categorias_productos.find(c=>c.id===category.id).imagen_url,'data:image/jpeg;base64,AAAA');
});
