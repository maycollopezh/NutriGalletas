import {safeImageUrl} from './images.js';
const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function productPhoto(product, className='') {
  const photo=safeImageUrl(product?.imagen_url);
  if(photo)return `<span class="product-photo uploaded-photo ${className}"><img src="${escape(photo)}" alt="Foto de ${escape(product.nombre)}" loading="lazy" decoding="async"></span>`;
  const index=['GAL-001','GAL-002','GAL-003','GAL-004','GAL-005','GAL-006'].indexOf(product?.codigo);
  if(index<0)return `<span class="product-photo photo-placeholder ${className}" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-9-9 4 4 0 0 0 4 4 4 4 0 0 0 5 5Z"/><circle cx="8" cy="9" r=".6"/><circle cx="7" cy="15" r=".6"/><circle cx="13" cy="16" r=".6"/></svg></span>`;
  return `<span class="product-photo ${className}" role="img" aria-label="Imagen ilustrativa de ${escape(product.nombre)}" style="--photo-x:${index%3*50}%;--photo-y:${index<3?0:100}%"></span>`;
}
