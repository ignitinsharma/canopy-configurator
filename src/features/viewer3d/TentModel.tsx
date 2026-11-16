import { useEffect, useRef } from 'react';
import { useGLTF } from '@react-three/drei/core/Gltf';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { Group, Mesh } from 'three';
import { sectionFromUv } from '@core/geometry';
import { useConfigurator, useConfigSelector } from '../ConfiguratorContext';
import { prepareModel, type Variant, belongsToNode } from './model';
import { useAtlasTexture } from './useAtlasTexture';
import type { AtlasApi } from './atlas';

export function TentModel({
  variant,
  onReady,
}: {
  variant: Variant;
  onReady: (height: number, atlas: AtlasApi) => void;
}) {
  const { scene } = useGLTF(variant.modelUrl, '/draco/', false);
  const { actions } = useConfigurator();
  const definition = useConfigSelector((s) => s.definition);
  const frameValue = useConfigSelector(
    (s) => s.config.optionSelections['frame-color'],
  );
  const frameColor =
    definition.optionGroups
      .find((g) => g.id === 'frame-color')
      ?.choices.find((c) => c.id === frameValue)?.color ?? '#B8BBC0';
  const invalidate = useThree((s) => s.invalidate);
  const atlas = useAtlasTexture(variant.id);
  const group = useRef<Group>(null);
  const owned = useRef<ReturnType<typeof prepareModel> | null>(null);
  useEffect(() => {
    const model = prepareModel(scene, variant, definition);
    owned.current = model;
    const parent = group.current!;
    parent.scale.setScalar(model.transform.scale);
    parent.position.fromArray(model.transform.position);
    parent.add(model.scene);
    invalidate();
    return () => {
      parent.remove(model.scene);
      owned.current = null;
      model.dispose();
    };
  }, [scene, variant, definition, onReady, invalidate]);
  useEffect(() => {
    if (!owned.current || !atlas) return;
    owned.current.setAtlas(atlas.texture);
    onReady(owned.current.height, atlas);
    invalidate();
  }, [atlas, scene, variant, onReady, invalidate]);
  useEffect(() => {
    owned.current?.frame.forEach((m) => m.color.set(frameColor));
    invalidate();
  }, [frameColor, scene, variant, invalidate]);
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() =>
        definition.variants.forEach((v) =>
          useGLTF.preload(v.modelUrl, '/draco/', false),
        ),
      );
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [definition]);
  function select(event: ThreeEvent<MouseEvent>) {
    if (
      !event.uv ||
      !(event.object instanceof Mesh) ||
      !belongsToNode(event.object, [
        ...new Set(
          Object.values(variant.sectionGeometry).map((g) => g.target.nodeName),
        ),
      ])
    )
      return;
    const mesh = event.object;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    const material = materials[event.face?.materialIndex ?? 0]; // face materialIndex selects the hit material, never identifies a printable primitive.
    if (material?.name !== definition.materialResolution?.printable) return;
    const id = sectionFromUv(variant.sectionGeometry, event.uv.x, event.uv.y);
    if (id) {
      event.stopPropagation();
      actions.selectSection(id);
    }
  }
  return <group ref={group} dispose={null} onClick={select} />;
}
