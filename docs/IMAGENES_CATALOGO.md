# Fotografías del catálogo

- Productos y categorías permiten cargar JPG, PNG o WebP al crear o editar, con vista previa y opción de volver a la ilustración predeterminada.
- Máximo de entrada: 5 MB y 25 megapíxeles. El navegador conserva las proporciones, reduce el lado mayor a 1200 px, convierte a JPEG y elimina metadatos del archivo original al volver a codificarlo. Límite de almacenamiento: 2 MB por foto.
- Supabase guarda los archivos en el bucket privado `catalogo-imagenes`; las tablas guardan `imagen_ruta`. Las URLs de lectura se firman temporalmente, se renuevan en las cargas de datos y no se persisten en la BD.
- Administrador y almacén pueden cargar imágenes; cajero solo consultarlas. Las políticas requieren una sesión autorizada activa (`rol_actual()`). No se cambia la autenticación ni se publica el bucket.
- Si la carga falla no se guarda el formulario. Si falla el guardado posterior, se intenta retirar la foto recién subida. Reemplazar o quitar una foto no elimina los archivos anteriores, para no romper vistas existentes; permanecen privados.
- La demostración guarda una copia reducida en el almacenamiento del navegador; el sistema conectado usa Supabase Storage.

Actualización: `supabase/005_imagenes_catalogo.sql`, aplicada en NutriGalletas el 6 de noviembre de 2026. Se comprobó la carga y lectura de una foto en un producto real, y después se restauró su ilustración previa. Se verificaron categorías en demostración, y la vista de 390 px sin desbordamiento horizontal.
