import {
  WebGLRenderTarget,
  HalfFloatType,
  type WebGLRenderer,
  type Scene,
  type PerspectiveCamera,
  Vector4,
} from 'three';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { viewPosition, type CaptureSide } from './camera';
export interface CaptureOptions {
  width?: number;
  height?: number;
}
export type CapturedViews = Record<CaptureSide, string>;
/** Uses a temporary camera and framebuffer; the visible camera and controls never move. */
export function captureViews(
  gl: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  realWidth: number,
  modelHeight: number,
  options: CaptureOptions = {},
): CapturedViews {
  const width = options.width ?? 1024,
    height = options.height ?? 1024;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 4096 ||
    height > 4096
  )
    throw new Error('Capture dimensions must be integers between 1 and 4096');
  const previous = gl.getRenderTarget(),
    viewport = gl.getViewport(new Vector4());
  // Renderer viewport is restored by setRenderTarget; save explicit viewport/scissor too.
  const scissor = gl.getScissor(new Vector4()),
    scissorTest = gl.getScissorTest();
  const target = new WebGLRenderTarget(width, height, { samples: 4 });
  // Three skips tone mapping for ordinary render targets. Preserve HDR first,
  // then apply the renderer's ACES/sRGB output pass before byte readback.
  const hdr = new WebGLRenderTarget(width, height, {
    type: HalfFloatType,
    samples: 4,
  });
  const output = new OutputPass();
  const captureCamera = camera.clone();
  captureCamera.aspect = width / height;
  captureCamera.updateProjectionMatrix();
  const result = {} as CapturedViews;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas capture unavailable');
  try {
    for (const side of ['front', 'back', 'left', 'right', 'top'] as const) {
      captureCamera.position.copy(viewPosition(side, realWidth, modelHeight));
      captureCamera.up.set(0, 1, 0);
      captureCamera.lookAt(0, modelHeight * 0.45, 0);
      captureCamera.updateMatrixWorld();
      gl.setRenderTarget(hdr);
      gl.setScissorTest(false);
      gl.render(scene, captureCamera);
      output.render(gl, target, hdr, 0, false);
      const pixels = new Uint8Array(width * height * 4);
      gl.readRenderTargetPixels(target, 0, 0, width, height, pixels);
      const image = context.createImageData(width, height);
      for (let y = 0; y < height; y++)
        image.data.set(
          pixels.subarray(
            (height - y - 1) * width * 4,
            (height - y) * width * 4,
          ),
          y * width * 4,
        );
      context.putImageData(image, 0, 0);
      result[side] = canvas.toDataURL('image/png');
    }
    return result;
  } finally {
    gl.setRenderTarget(previous);
    gl.setViewport(viewport);
    gl.setScissor(scissor);
    gl.setScissorTest(scissorTest);
    target.dispose();
    hdr.dispose();
    output.dispose();
  }
}
