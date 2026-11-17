import type { ProductDefinition } from '../definition';
import type { ProductConfig } from '../config';
import { clipPolygon, type Geometry } from '../geometry';
export type ResolvedAssets = ReadonlyMap<string, CanvasImageSource>;
export interface RenderSectionOptions {
  sectionGeometry: Geometry;
  sectionConfig: ProductConfig['sections'][string];
  resolvedAssets: ResolvedAssets;
  fonts: ProductDefinition['fonts'];
  pxPerMeter: number;
  baseColor?: string;
}
/** Shared local renderer for preview, future editor and PDF. No DOM, store or async work.
 * Caller supplies a local canvas/identity context and already-loaded font/image resources. */
export function renderSection(
  ctx: CanvasRenderingContext2D,
  {
    sectionGeometry: g,
    sectionConfig,
    resolvedAssets,
    fonts,
    pxPerMeter,
    baseColor = '#FFFFFF',
  }: RenderSectionOptions,
) {
  const width = g.sizeMeters.width * pxPerMeter,
    height = g.sizeMeters.height * pxPerMeter;
  ctx.save();
  try {
    ctx.clearRect(0, 0, Math.ceil(width), Math.ceil(height));
    ctx.beginPath();
    clipPolygon(g).forEach(([x, y], i) =>
      i ? ctx.lineTo(x * width, y * height) : ctx.moveTo(x * width, y * height),
    );
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = sectionConfig.backgroundColor ?? baseColor;
    ctx.fillRect(0, 0, width, height);
    for (const e of sectionConfig.elements) {
      ctx.save();
      try {
        const bw = e.transform.size.width * width,
          bh = e.transform.size.height * height;
        ctx.translate(
          e.transform.position.x * width,
          e.transform.position.y * height,
        );
        ctx.rotate((e.transform.rotationDeg * Math.PI) / 180);
        ctx.scale(e.transform.scale, e.transform.scale);
        ctx.translate(-bw / 2, -bh / 2);
        ctx.beginPath();
        ctx.rect(0, 0, bw, bh);
        ctx.clip();
        if (e.type === 'text') {
          const font = fonts.find((f) => f.id === e.fontId),
            fontPx = e.fontSize * height;
          ctx.font = `${font?.style ?? 'normal'} ${font?.weight ?? 400} ${fontPx}px "${(font?.family ?? 'sans-serif').replace(/["\\]/g, '')}"`;
          ctx.fillStyle = e.color;
          ctx.textAlign = e.align;
          ctx.textBaseline = 'top';
          const lines = wrapText(
              e.text,
              bw,
              (text) => ctx.measureText(text).width,
            ),
            x = e.align === 'center' ? bw / 2 : e.align === 'right' ? bw : 0;
          lines.forEach((line, index) => {
            const y = index * fontPx * e.lineHeight;
            if (y < bh) ctx.fillText(line, x, y);
          });
        } else {
          ctx.globalAlpha = e.opacity;
          const image = resolvedAssets.get(e.assetId);
          if (image) {
            const size = imageDimensions(image);
            const factor = Math.min(bw / size.width, bh / size.height);
            ctx.drawImage(
              image,
              (bw - size.width * factor) / 2,
              (bh - size.height * factor) / 2,
              size.width * factor,
              size.height * factor,
            );
          } else {
            ctx.fillStyle = '#fee2e2';
            ctx.fillRect(0, 0, bw, bh);
            ctx.strokeStyle = '#b42318';
            ctx.lineWidth = 2;
            ctx.strokeRect(1, 1, bw - 2, bh - 2);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(bw, bh);
            ctx.moveTo(bw, 0);
            ctx.lineTo(0, bh);
            ctx.stroke();
            ctx.fillStyle = '#7f1d1d';
            ctx.font = `${Math.max(10, Math.min(24, bh / 5))}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Missing image', bw / 2, bh / 2, bw);
          }
        }
      } finally {
        ctx.restore();
      }
    }
  } finally {
    ctx.restore();
  }
}
export function imageDimensions(image: CanvasImageSource): {
  width: number;
  height: number;
} {
  const value = image as {
    width?: number;
    height?: number;
    naturalWidth?: number;
    naturalHeight?: number;
    videoWidth?: number;
    videoHeight?: number;
  };
  return {
    width: value.naturalWidth || value.videoWidth || Number(value.width) || 1,
    height:
      value.naturalHeight || value.videoHeight || Number(value.height) || 1,
  };
}
export function wrapText(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) {
        lines.push(line);
        line = '';
      }
      for (const char of Array.from(word)) {
        if (line && measure(line + char) > maxWidth) {
          lines.push(line);
          line = '';
        }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
}
