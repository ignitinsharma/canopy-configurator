import { expect, it, vi } from 'vitest';
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Texture,
  Box3,
} from 'three';
import { prepareModel } from './model';
import { parseDefinition } from '@core/definition';
import raw from '@products/canopy-tent/definition.json';
it.each([false, true])(
  'finds materials by name with inner-first=%s, normalizes and owns resources',
  (innerFirst) => {
    const d = parseDefinition(raw),
      variant = d.variants[1]!;
    const source = new Group();
    source.position.set(3, -2, 5);
    const fabric = new Group();
    fabric.name = 'fabric';
    source.add(fabric);
    const outer = new MeshStandardMaterial({
        name: 'fabric_Mat',
        normalMap: new Texture(),
        roughnessMap: new Texture(),
      }),
      inner = new MeshStandardMaterial({ name: 'Inner_fabric' });
    for (const m of innerFirst ? [inner, outer] : [outer, inner])
      fabric.add(new Mesh(new BoxGeometry(1, 1, 1), m));
    const leg = new Mesh(
      new BoxGeometry(0.1, 2, 0.1),
      new MeshStandardMaterial({ name: 'Metal_mat', map: new Texture() }),
    );
    leg.name = 'leg';
    source.add(leg);
    const model = prepareModel(source, variant, d);
    const wrapper = new Group();
    wrapper.position.fromArray(model.transform.position);
    wrapper.scale.setScalar(model.transform.scale);
    wrapper.add(model.scene);
    wrapper.updateMatrixWorld(true);
    const box = new Box3().setFromObject(wrapper);
    expect(box.max.x - box.min.x).toBeCloseTo(1.98);
    expect(box.min.y).toBeCloseTo(0);
    expect(box.max.z + box.min.z).toBeCloseTo(0);
    const atlas = new Texture();
    model.setAtlas(atlas);
    expect(model.printable[0]!.map).toBe(atlas);
    expect(outer.map).toBeNull();
    expect(model.printable[0]!.normalMap).not.toBe(outer.normalMap);
    expect(model.frame).toHaveLength(1);
    const originalDispose = vi.spyOn(outer, 'dispose'),
      copyDispose = vi.spyOn(model.printable[0]!, 'dispose'),
      normalDispose = vi.spyOn(model.printable[0]!.normalMap!, 'dispose'),
      atlasDispose = vi.spyOn(atlas, 'dispose');
    model.dispose();
    expect(copyDispose).toHaveBeenCalledOnce();
    expect(normalDispose).toHaveBeenCalledOnce();
    expect(originalDispose).not.toHaveBeenCalled();
    expect(atlasDispose).not.toHaveBeenCalled();
  },
);
