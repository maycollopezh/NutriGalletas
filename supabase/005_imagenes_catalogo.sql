begin;
alter table public.productos add column if not exists imagen_ruta text;
alter table public.categorias_productos add column if not exists imagen_ruta text;
-- Las fotos se mantienen privadas; solo las sesiones autorizadas pueden consultarlas.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('catalogo-imagenes','catalogo-imagenes',false,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists catalogo_imagenes_lectura on storage.objects;
create policy catalogo_imagenes_lectura on storage.objects for select to authenticated
using(bucket_id='catalogo-imagenes' and public.rol_actual() in ('administrador','cajero','almacen'));
drop policy if exists catalogo_imagenes_crear on storage.objects;
create policy catalogo_imagenes_crear on storage.objects for insert to authenticated
with check(bucket_id='catalogo-imagenes' and public.rol_actual() in ('administrador','almacen')
and (storage.foldername(name))[1] in ('productos','categorias_productos') and (storage.foldername(name))[2]=auth.uid()::text
and lower(storage.extension(name)) in ('jpg','jpeg','png','webp'));
-- Permite retirar una carga propia si falla el guardado del formulario.
drop policy if exists catalogo_imagenes_retirar_propia on storage.objects;
create policy catalogo_imagenes_retirar_propia on storage.objects for delete to authenticated
using(bucket_id='catalogo-imagenes' and public.rol_actual() in ('administrador','almacen') and (storage.foldername(name))[2]=auth.uid()::text);
notify pgrst,'reload schema';
commit;
