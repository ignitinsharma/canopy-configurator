import { CanvasTexture, SRGBColorSpace } from 'three';
import { atlasPolygon, sectionToUv, type Geometry } from '@core/geometry';
export interface AtlasApi {
  getCanvas(): HTMLCanvasElement;
  markDirty(sectionId?: string): void;
  texture: CanvasTexture;
  setBaseColor(color: string): void;
  setOverlay(sectionId: string | null, debug: boolean): void;
  dispose(): void;
}
/** Artwork and presentation canvases are separate: debug/selection never change real artwork.
 * markDirty copies current artwork and schedules an R3F demand frame. */
export function createAtlas(
  geometry: Record<string, Geometry>,
  invalidate: () => void,
  maxAnisotropy = 1,
): AtlasApi {
  const canvas = document.createElement('canvas'),
    presentation = document.createElement('canvas');
  canvas.width =
    canvas.height =
    presentation.width =
    presentation.height =
      2048;
  const base = canvas.getContext('2d'),
    ctx = presentation.getContext('2d');
  if (!base || !ctx) throw new Error('Canvas 2D unavailable');
  const texture = new CanvasTexture(presentation);
  texture.flipY = false;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = Math.min(8, maxAnisotropy);
  let selected: string | null = null,
    debug = false,
    disposed = false;
  function redraw() {
    if (disposed) return;
    ctx!.clearRect(0, 0, 2048, 2048);
    ctx!.drawImage(canvas, 0, 0);
    for (const [id, g] of Object.entries(geometry)) {
      const polygon = atlasPolygon(g);
      ctx!.save();
      ctx!.beginPath();
      polygon.forEach(([x, y], i) =>
        i ? ctx!.lineTo(x * 2048, y * 2048) : ctx!.moveTo(x * 2048, y * 2048),
      );
      ctx!.closePath();
      if (id === selected) {
        ctx!.fillStyle = 'rgba(44,136,255,.14)';
        ctx!.fill();
        ctx!.strokeStyle = '#3984da';
        ctx!.lineWidth = 4;
        ctx!.stroke();
      }
      ctx!.restore();
      if (debug) {
        const { u0, v0, u1, v1 } = g.uvRect;
        ctx!.strokeStyle = '#d02d5a';
        ctx!.lineWidth = 3;
        ctx!.strokeRect(
          u0 * 2048,
          v0 * 2048,
          (u1 - u0) * 2048,
          (v1 - v0) * 2048,
        );
        // Arrow and label follow exactly the same quarter-turn mapping as section artwork.
        const center = sectionToUv(g, [0.5, 0.65]),
          up = sectionToUv(g, [0.5, 0.25]);
        const angle = Math.atan2(up[1] - center[1], up[0] - center[0]);
        ctx!.save();
        ctx!.translate(center[0] * 2048, center[1] * 2048);
        ctx!.rotate(angle + Math.PI / 2);
        ctx!.fillStyle = '#111';
        ctx!.font = 'bold 21px sans-serif';
        ctx!.textAlign = 'center';
        ctx!.fillText(id, 0, 28);
        ctx!.strokeStyle = '#111';
        ctx!.lineWidth = 6;
        const length = Math.hypot(up[0] - center[0], up[1] - center[1]) * 2048;
        ctx!.beginPath();
        ctx!.moveTo(0, 0);
        ctx!.lineTo(0, -length);
        ctx!.moveTo(-12, -length + 18);
        ctx!.lineTo(0, -length);
        ctx!.lineTo(12, -length + 18);
        ctx!.stroke();
        ctx!.restore();
      }
    }
    texture.needsUpdate = true;
    invalidate();
  }
  const api: AtlasApi = {
    texture,
    getCanvas: () => canvas,
    markDirty: () => redraw(),
    setBaseColor(color) {
      base.fillStyle = color;
      base.fillRect(0, 0, 2048, 2048);
      redraw();
    },
    setOverlay(id, enabled) {
      selected = id;
      debug = enabled;
      redraw();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      texture.dispose();
      canvas.width = presentation.width = 0;
    },
  };
  api.setBaseColor('#FFFFFF');
  return api;
}
