import {mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
await mkdir('/tmp/nutrigalletas-ai',{recursive:true});
execFileSync('npx',['--yes','esbuild@0.25',resolve(root,'supabase/functions/nutri-ai/index.ts'),'--bundle','--platform=neutral','--format=esm','--external:npm:*','--external:node:*','--banner:js=// @ts-nocheck -- Generated JavaScript bundle; modules checked separately.','--outfile=/tmp/nutrigalletas-ai/index.ts'],{stdio:'inherit'});
console.log('Función única sin secretos: /tmp/nutrigalletas-ai/index.ts');
