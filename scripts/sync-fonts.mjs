import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(path.join(root, 'public/fonts'), { recursive: true });
for (const name of [
  'inter',
  'montserrat',
  'oswald',
  'playfair-display',
  'roboto-slab',
]) {
  await copyFile(
    path.join(
      root,
      `node_modules/@fontsource/${name}/files/${name}-latin-400-normal.woff2`,
    ),
    path.join(root, `public/fonts/${name}-latin-400-normal.woff2`),
  );
  await copyFile(
    path.join(root, `node_modules/@fontsource/${name}/LICENSE`),
    path.join(root, `public/fonts/${name}-LICENSE`),
  );
}
