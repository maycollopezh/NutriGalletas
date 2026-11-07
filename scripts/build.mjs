import { mkdir, copyFile, cp } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
await mkdir(resolve(root, 'dist'), { recursive: true });
await copyFile(resolve(root, 'index.html'), resolve(root, 'dist/index.html'));
await cp(resolve(root, 'src'), resolve(root, 'dist/src'), { recursive: true });
console.log('Sitio preparado en dist/. SQL, documentación y funciones privadas no se publican.');
