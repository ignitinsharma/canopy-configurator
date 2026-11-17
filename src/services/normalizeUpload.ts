import DOMPurify from 'dompurify';
import type { ProductDefinition } from '@core/definition';
export type ImageLimits =
  ProductDefinition['sections'][number]['constraints']['image'];
export const defaultImageLimits: ImageLimits = {
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
  maxBytes: 10485760,
  maxWidthPx: 8192,
  maxHeightPx: 8192,
  maxPixels: 40000000,
  recommendedDpi: 150,
  warningDpi: 100,
  blockingDpi: 50,
};
export function validateUploadHeader(
  file: Pick<Blob, 'type' | 'size'>,
  limits: ImageLimits,
) {
  if (
    !limits.allowedMimeTypes.includes(
      file.type as ImageLimits['allowedMimeTypes'][number],
    )
  )
    throw new Error('Unsupported image type. Use PNG, JPEG, WebP or SVG.');
  if (file.size === 0 || file.size > limits.maxBytes)
    throw new Error(
      `Image must be nonempty and at most ${Math.round(limits.maxBytes / 1048576)} MB.`,
    );
}
export function downscaledDimensions(
  width: number,
  height: number,
  max = 2048,
) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    throw new Error('Invalid image dimensions');
  const factor = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
  };
}
export function sanitizeSvg(
  source: string,
  limits: ImageLimits = defaultImageLimits,
): string {
  if (/<!DOCTYPE|<!ENTITY/i.test(source))
    throw new Error('SVG document entities are unsupported');
  // An explicit subset supports vector logos, gradients and clipping but no
  // scripts, stylesheets, foreignObject, image embedding or external resources.
  const clean = DOMPurify.sanitize(source, {
    ALLOWED_TAGS: [
      'svg',
      'g',
      'path',
      'rect',
      'circle',
      'ellipse',
      'line',
      'polyline',
      'polygon',
      'defs',
      'linearGradient',
      'radialGradient',
      'stop',
      'clipPath',
      'text',
      'tspan',
      'title',
      'desc',
    ],
    ALLOWED_ATTR: [
      'xmlns',
      'viewBox',
      'width',
      'height',
      'x',
      'y',
      'x1',
      'y1',
      'x2',
      'y2',
      'cx',
      'cy',
      'r',
      'rx',
      'ry',
      'd',
      'points',
      'fill',
      'fill-rule',
      'fill-opacity',
      'stroke',
      'stroke-width',
      'stroke-linecap',
      'stroke-linejoin',
      'stroke-opacity',
      'opacity',
      'transform',
      'id',
      'offset',
      'stop-color',
      'stop-opacity',
      'gradientUnits',
      'gradientTransform',
      'clip-path',
      'preserveAspectRatio',
      'font-family',
      'font-size',
      'font-weight',
      'text-anchor',
    ],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
  const doc = new DOMParser().parseFromString(clean, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.localName !== 'svg' || doc.querySelector('parsererror'))
    throw new Error('Invalid SVG');
  for (const element of [root, ...root.querySelectorAll('*')])
    for (const attribute of [...element.attributes]) {
      const value = attribute.value;
      if (
        /url\s*\(/i.test(value) &&
        !/^url\(#[a-zA-Z0-9_.:-]+\)$/.test(value.trim())
      )
        element.removeAttribute(attribute.name);
    }
  const view = root
    .getAttribute('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  let width = Number(root.getAttribute('width')),
    height = Number(root.getAttribute('height'));
  if (!(width > 0 && height > 0)) {
    if (
      !view ||
      view.length !== 4 ||
      !view.every(Number.isFinite) ||
      view[2]! <= 0 ||
      view[3]! <= 0
    )
      throw new Error('SVG needs pixel dimensions or a valid viewBox');
    width = view[2]!;
    height = view[3]!;
  }
  if (
    width > limits.maxWidthPx ||
    height > limits.maxHeightPx ||
    width * height > limits.maxPixels
  )
    throw new Error('SVG dimensions exceed the upload limits');
  // Rasterize a bounded viewport rather than allocating the SVG's full size.
  if (!root.hasAttribute('viewBox'))
    root.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const size = downscaledDimensions(width, height);
  root.setAttribute('width', String(size.width));
  root.setAttribute('height', String(size.height));
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return new XMLSerializer().serializeToString(root);
}
export async function normalizeUpload(
  file: Blob,
  limits: ImageLimits = defaultImageLimits,
): Promise<{ blob: Blob; width: number; height: number }> {
  validateUploadHeader(file, limits);
  let bitmap: ImageBitmap;
  if (file.type === 'image/svg+xml') {
    const safe = sanitizeSvg(await file.text(), limits);
    const blob = new Blob([safe], { type: 'image/svg+xml' }),
      url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      bitmap = await createImageBitmap(image);
    } finally {
      URL.revokeObjectURL(url);
    }
  } else {
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const actual =
      bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
        ? 'image/png'
        : bytes[0] === 255 && bytes[1] === 216
          ? 'image/jpeg'
          : String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
              String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
            ? 'image/webp'
            : null;
    if (actual !== file.type)
      throw new Error('Image content does not match its type');
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  }
  try {
    if (
      bitmap.width > limits.maxWidthPx ||
      bitmap.height > limits.maxHeightPx ||
      bitmap.width * bitmap.height > limits.maxPixels
    )
      throw new Error('Image dimensions exceed section limits');
    const size = downscaledDimensions(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error('Image encoding failed')),
        'image/png',
      ),
    );
    if (blob.size > limits.maxBytes)
      throw new Error('Normalized image exceeds the section byte limit');
    return { blob, ...size };
  } finally {
    bitmap.close();
  }
}
