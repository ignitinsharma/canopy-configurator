import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  prune,
  draco,
  textureCompress,
} from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { mkdir, copyFile, stat, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });
const definition = JSON.parse(
  await readFile(
    path.join(root, 'src/products/canopy-tent/definition.json'),
    'utf8',
  ),
);
const sources = {
  '5x5': 'Tent_5_5.glb',
  '6.5x6.5': 'Tent 6.5_6.5.glb',
  '8x8': 'Tent_8_8.glb',
};
await mkdir(path.join(root, 'public/models'), { recursive: true });
await mkdir(path.join(root, 'public/draco'), { recursive: true });
for (const file of [
  'draco_decoder.js',
  'draco_wasm_wrapper.js',
  'draco_decoder.wasm',
]) {
  await copyFile(
    path.join(root, 'node_modules/three/examples/jsm/libs/draco/gltf', file),
    path.join(root, 'public/draco', file),
  );
}
await copyFile(
  path.join(root, 'node_modules/three/examples/jsm/libs/draco/README.md'),
  path.join(root, 'public/draco/README.md'),
);
const rows = [];
for (const variant of definition.variants) {
  const input = path.join(root, 'assets-source', sources[variant.id]);
  const output = path.join(root, 'public', variant.modelUrl.replace(/^\//, ''));
  const doc = await io.read(input);
  const names = doc
    .getRoot()
    .listNodes()
    .map((n) => n.getName())
    .sort();
  const materialNames = doc
    .getRoot()
    .listMaterials()
    .map((m) => m.getName())
    .sort();
  const fabric = doc
    .getRoot()
    .listMaterials()
    .find((m) => m.getName() === 'fabric_Mat');
  if (!fabric) throw new Error(`Missing fabric_Mat: ${input}`);
  const normal = !!fabric.getNormalTexture();
  const roughness = !!fabric.getMetallicRoughnessTexture();
  fabric.setBaseColorTexture(null);
  // Deliberately avoid flatten/join/instance/material dedup: node/material identity is contractual.
  await doc.transform(
    prune({ keepLeaves: true, keepAttributes: true, keepSolidTextures: true }),
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      resize: [1024, 1024],
      quality: 85,
    }),
    dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.TEXTURE] }),
    draco({ method: 'edgebreaker' }),
  );
  await io.write(output, doc);
  const verified = await io.read(output);
  if (
    JSON.stringify(names) !==
      JSON.stringify(
        verified
          .getRoot()
          .listNodes()
          .map((n) => n.getName())
          .sort(),
      ) ||
    JSON.stringify(materialNames) !==
      JSON.stringify(
        verified
          .getRoot()
          .listMaterials()
          .map((m) => m.getName())
          .sort(),
      )
  )
    throw new Error('Node/material identities changed');
  const resultFabric = verified
    .getRoot()
    .listMaterials()
    .find((m) => m.getName() === 'fabric_Mat');
  if (
    resultFabric.getBaseColorTexture() ||
    !!resultFabric.getNormalTexture() !== normal ||
    !!resultFabric.getMetallicRoughnessTexture() !== roughness
  )
    throw new Error('Fabric map contract violated');
  for (const texture of verified.getRoot().listTextures()) {
    const size = texture.getSize();
    if (
      texture.getMimeType() !== 'image/webp' ||
      !size ||
      size.some((v) => v > 1024)
    )
      throw new Error('Texture optimization contract violated');
  }
  const before = (await stat(input)).size,
    after = (await stat(output)).size;
  rows.push({
    size: variant.id,
    beforeBytes: before,
    afterBytes: after,
    reduction: `${(100 * (1 - after / before)).toFixed(1)}%`,
  });
}
console.table(rows);
if (rows.some((row) => row.afterBytes >= 2_000_000))
  throw new Error('Model exceeds 2 MB budget');
