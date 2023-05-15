import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const outdir = path.join(__dirname, 'dist');

await esbuild.build({
  entryPoints: ['src/highlight-sets.ts'],
  sourcemap: true,
  target: ['chrome113'],
  outdir,
});

await fs.cp(path.join(__dirname, 'images'), path.join(outdir, 'images'), { recursive: true });

await fs.cp(path.join(__dirname, 'manifest.json'), path.join(outdir, 'manifest.json'));
