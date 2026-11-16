import { mkdir, copyFile, cp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
await rm(resolve(root, 'dist'), { recursive: true, force: true });
await mkdir(resolve(root, 'dist'), { recursive: true });
await copyFile(resolve(root, 'index.html'), resolve(root, 'dist/index.html'));
await cp(resolve(root, 'src'), resolve(root, 'dist/src'), { recursive: true });
console.log(
  'Sitio preparado en dist/. SQL, documentación y funciones privadas no se publican.',
);
