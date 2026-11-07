export const IMAGE_BUCKET = 'catalogo-imagenes';
export const IMAGE_TABLES = ['productos','categorias_productos'];
export function validateImageFile(file) {
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Elige una imagen JPG, PNG o WebP.');
 if(!file.size||file.size>5*1024*1024)throw new Error('La imagen debe pesar como máximo 5 MB.');
}
export async function prepareImage(file) {
 validateImageFile(file);
 let image;try{image=await createImageBitmap(file);}catch{throw new Error('No se pudo leer esa imagen. Prueba con otra foto.');}
 try{
  if(!image.width||!image.height||image.width*image.height>25000000)throw new Error('La imagen es demasiado grande. Usa una foto de hasta 25 megapíxeles.');
  const scale=Math.min(1,1200/Math.max(image.width,image.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  const context=canvas.getContext('2d');context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.85));
  if(!blob||blob.size>2*1024*1024)throw new Error('No se pudo preparar la foto. Elige una imagen más pequeña.');
  const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('No se pudo leer la foto.'));r.readAsDataURL(blob);});
  return {blob,dataUrl};
 }finally{image.close();}
}
export function safeImageUrl(value) {
 return typeof value==='string'&&(/^https:\/\//i.test(value)||/^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(value))?value:'';
}
