import { Vector3 } from 'three';
export type CaptureSide = 'front' | 'back' | 'left' | 'right' | 'top';
export function viewPosition(
  side: CaptureSide,
  width: number,
  height: number,
  roof = false,
) {
  const distance = width * 2.4,
    target = height * 0.45;
  const y = roof ? height + width * 0.7 : height * 0.65;
  return new Vector3(
    side === 'left' ? -distance : side === 'right' ? distance : 0,
    side === 'top' ? height + distance : y,
    side === 'front'
      ? distance
      : side === 'back'
        ? -distance
        : side === 'top'
          ? 0.001
          : 0,
  ).add(new Vector3(0, side === 'top' ? 0 : target * 0.1, 0));
}
