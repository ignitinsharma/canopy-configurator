import {
  Box3,
  Mesh,
  MeshStandardMaterial,
  Texture,
  type Object3D,
  type Material,
  type BufferGeometry,
} from 'three';
import { normalizationForBounds } from '@core/geometry';
import type { ProductDefinition } from '@core/definition';
export type Variant = ProductDefinition['variants'][number];
export function belongsToNode(object: Object3D, names: string[]) {
  let current: Object3D | null = object;
  while (current) {
    if (names.includes(current.name)) return true;
    current = current.parent;
  }
  return false;
}
/** Loader cache resources are immutable. Every mounted model owns cloned GPU resources.
 * Never dispose the shared useGLTF cache's geometries, materials or image sources. */
export function prepareModel(
  source: Object3D,
  variant: Variant,
  definition: ProductDefinition,
) {
  const scene = source.clone(true),
    geometries = new Map<BufferGeometry, BufferGeometry>(),
    materials = new Map<Material, Material>(),
    textures = new Map<Texture, Texture>();
  const printable: MeshStandardMaterial[] = [],
    frame: MeshStandardMaterial[] = [];
  const target = definition.materialResolution;
  if (!target) throw new Error('Material resolution definition required');
  const binding = definition.materialBindings.find(
    (b) => b.materialName === target.frame,
  );
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    let geometry = geometries.get(object.geometry);
    if (!geometry) {
      geometry = object.geometry.clone() as BufferGeometry;
      geometries.set(object.geometry, geometry);
    }
    object.geometry = geometry;
    object.castShadow = object.receiveShadow = true;
    const clone = (original: Material) => {
      let material = materials.get(original);
      if (!material) {
        material = original.clone();
        for (const [key, value] of Object.entries(material)) {
          if (value instanceof Texture) {
            let texture = textures.get(value);
            if (!texture) {
              texture = value.clone();
              textures.set(value, texture);
            }
            (material as unknown as Record<string, unknown>)[key] = texture;
          }
        }
        materials.set(original, material);
      }
      if (material instanceof MeshStandardMaterial) {
        if (
          material.name === target.printable &&
          belongsToNode(object, [
            ...new Set(
              Object.values(variant.sectionGeometry).map(
                (g) => g.target.nodeName,
              ),
            ),
          ])
        )
          printable.push(material);
        if (
          material.name === target.frame &&
          binding &&
          belongsToNode(object, binding.nodeNames)
        )
          frame.push(material);
      }
      return material;
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(clone)
      : clone(object.material);
  });
  const dispose = () => {
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
  };
  if (!printable.length || !frame.length) {
    dispose();
    throw new Error('Required printable or frame material binding not found');
  }
  scene.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(scene);
  const transform = normalizationForBounds(
    bounds.min.toArray() as [number, number, number],
    bounds.max.toArray() as [number, number, number],
    variant.realWidthMeters,
    variant.modelNormalization.axis,
  );
  return {
    setAtlas(texture: Texture) {
      for (const material of printable) {
        material.map = texture;
        material.color.set('#ffffff');
        material.needsUpdate = true;
      }
    },
    scene,
    printable,
    frame,
    transform,
    height: (bounds.max.y - bounds.min.y) * transform.scale,
    dispose,
  };
}
