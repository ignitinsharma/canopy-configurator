// @vitest-environment node
import { createCanvas, type Canvas } from '@napi-rs/canvas';
import { expect, it } from 'vitest';
import { renderSection, wrapText } from './section';
import { compositeSectionIntoAtlas, sectionPixelsPerMeter } from './composite';
import { createSectionCompositor } from './compositor';
import { changedSectionIds, createDirtyQueue } from './dirty';
import { parseDefinition } from '../definition';
import { sectionToUv } from '../geometry';
import raw from '@products/canopy-tent/definition.json';
import type { ProductConfig, ImageElement } from '../config';
const definition = parseDefinition(raw);
const ctx = (canvas: Canvas) =>
  canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
const source = (canvas: Canvas) => canvas as unknown as HTMLCanvasElement;
function color(canvas: Canvas, u: number, v: number) {
  return [
    ...canvas
      .getContext('2d')
      .getImageData(
        Math.floor(u * canvas.width),
        Math.floor(v * canvas.height),
        1,
        1,
      ).data,
  ];
}
it.each(definition.variants)(
  'clips, rotates and preserves neighboring pixels for every $id section',
  (variant) => {
    const atlas = createCanvas(2048, 2048),
      atlasCtx = ctx(atlas);
    for (const g of Object.values(variant.sectionGeometry)) {
      atlasCtx.fillStyle = '#00ff00';
      atlasCtx.fillRect(0, 0, 2048, 2048);
      const ppm = sectionPixelsPerMeter(g),
        local = createCanvas(
          Math.ceil(g.sizeMeters.width * ppm),
          Math.ceil(g.sizeMeters.height * ppm),
        );
      const localCtx = ctx(local);
      localCtx.fillStyle = '#ff0000';
      localCtx.fillRect(0, 0, local.width / 2, local.height);
      localCtx.fillStyle = '#0000ff';
      localCtx.fillRect(local.width / 2, 0, local.width, local.height);
      compositeSectionIntoAtlas(atlasCtx, g, source(local));
      expect(color(atlas, ...sectionToUv(g, [0.3, 0.8]))).toEqual([
        255, 0, 0, 255,
      ]);
      expect(color(atlas, ...sectionToUv(g, [0.7, 0.8]))).toEqual([
        0, 0, 255, 255,
      ]);
      expect(color(atlas, 0, 0)).toEqual([0, 255, 0, 255]);
      if (g.shape === 'triangle')
        expect(color(atlas, ...sectionToUv(g, [0.05, 0.05]))).toEqual([
          0, 255, 0, 255,
        ]);
      local.width = 0;
    }
    atlas.width = 0;
  },
);
it('uses one renderer for clipping, ordered images, contain fit, opacity and transform restoration', () => {
  const g = definition.variants[0]!.sectionGeometry['roof-front']!,
    canvas = createCanvas(300, 300),
    image = createCanvas(40, 20);
  image.getContext('2d').fillStyle = 'blue';
  image.getContext('2d').fillRect(0, 0, 40, 20);
  const e: ImageElement = {
    id: 'image',
    type: 'image',
    assetId: 'logo',
    fit: 'contain',
    opacity: 1,
    transform: {
      position: { x: 0.5, y: 0.7 },
      size: { width: 0.4, height: 0.4 },
      scale: 1,
      rotationDeg: 0,
    },
  };
  renderSection(ctx(canvas), {
    sectionGeometry: g,
    sectionConfig: { backgroundColor: '#ff0000', elements: [e] },
    resolvedAssets: new Map([['logo', source(image)]]),
    fonts: [],
    pxPerMeter: 150,
  });
  const w = g.sizeMeters.width * 150,
    h = g.sizeMeters.height * 150;
  expect(color(canvas, (w * 0.5) / 300, (h * 0.7) / 300)).toEqual([
    0, 0, 255, 255,
  ]);
  expect(color(canvas, 0.005, 0.005)[3]).toBe(0);
  expect(ctx(canvas).globalAlpha).toBe(1);
  renderSection(ctx(canvas), {
    sectionGeometry: g,
    sectionConfig: {
      backgroundColor: '#ff0000',
      elements: [{ ...e, opacity: 0 }],
    },
    resolvedAssets: new Map([['logo', source(image)]]),
    fonts: [],
    pxPerMeter: 150,
  });
  expect(color(canvas, (w * 0.5) / 300, (h * 0.7) / 300)).toEqual([
    255, 0, 0, 255,
  ]);
});
it('wraps long words, lines and explicit blank paragraphs', () => {
  expect(wrapText('abcd ef\n\nxyz', 3, (s) => s.length)).toEqual([
    'abc',
    'd',
    'ef',
    '',
    'xyz',
  ]);
});
it('renders only structurally changed sections and never clears neighboring roof interiors', () => {
  const variant = definition.variants[0]!,
    atlas = createCanvas(2048, 2048);
  const sections: ProductConfig['sections'] = Object.fromEntries(
    Object.keys(variant.sectionGeometry).map((id) => [
      id,
      { backgroundColor: '#ff0000', elements: [] },
    ]),
  );
  const compositor = createSectionCompositor({
    canvas: source(atlas),
    geometry: variant.sectionGeometry,
    fonts: () => [],
    assets: () => new Map(),
    ready: () => true,
    makeCanvas: () => source(createCanvas(1, 1)),
  });
  const first = compositor.update(sections, '#00ff00');
  expect(first).toHaveLength(8);
  compositor.render(first);
  const next = {
    ...sections,
    'roof-front': { ...sections['roof-front']!, backgroundColor: '#0000ff' },
  };
  expect(changedSectionIds(sections, next)).toEqual(['roof-front']);
  const dirty = compositor.update(next, '#00ff00');
  expect(compositor.render(dirty)).toEqual(['roof-front']);
  for (const [id, g] of Object.entries(variant.sectionGeometry))
    expect(color(atlas, ...sectionToUv(g, [0.5, 0.7]))).toEqual(
      id === 'roof-front' ? [0, 0, 255, 255] : [255, 0, 0, 255],
    );
  expect(color(atlas, 0, 0)).toEqual([0, 255, 0, 255]);
  compositor.dispose();
});
it('coalesces dirty changes into one scheduled frame', () => {
  const scheduled: FrameRequestCallback[] = [],
    flushed: string[][] = [];
  const queue = createDirtyQueue(
    (ids) => flushed.push(ids),
    (cb) => {
      scheduled.push(cb);
      return scheduled.length;
    },
    () => {},
  );
  queue.mark(['front']);
  queue.mark(['front', 'left']);
  expect(scheduled).toHaveLength(1);
  scheduled[0]!(0);
  expect(flushed).toEqual([['front', 'left']]);
  queue.dispose();
  queue.mark(['back']);
  expect(scheduled).toHaveLength(1);
});

it('draws image layers in array order and restores state even for multiline transformed text', () => {
  const g = {
      ...definition.variants[0]!.sectionGeometry['valance-front']!,
      shape: 'rect' as const,
      sizeMeters: { width: 1, height: 1 },
    },
    canvas = createCanvas(100, 100),
    red = createCanvas(1, 1),
    blue = createCanvas(1, 1);
  red.getContext('2d').fillStyle = 'red';
  red.getContext('2d').fillRect(0, 0, 1, 1);
  blue.getContext('2d').fillStyle = 'blue';
  blue.getContext('2d').fillRect(0, 0, 1, 1);
  const e: ImageElement = {
    id: 'a',
    type: 'image',
    assetId: 'red',
    fit: 'contain',
    opacity: 1,
    transform: {
      position: { x: 0.5, y: 0.5 },
      size: { width: 1, height: 1 },
      scale: 1,
      rotationDeg: 0,
    },
  };
  const context = ctx(canvas);
  renderSection(context, {
    sectionGeometry: g,
    sectionConfig: {
      backgroundColor: '#ffffff',
      elements: [e, { ...e, id: 'b', assetId: 'blue' }],
    },
    resolvedAssets: new Map([
      ['red', source(red)],
      ['blue', source(blue)],
    ]),
    fonts: [],
    pxPerMeter: 100,
  });
  expect(color(canvas, 0.5, 0.5)).toEqual([0, 0, 255, 255]);
  const calls: string[] = [],
    original = context.fillText.bind(context);
  context.fillText = (line, x, y) => {
    calls.push(line);
    original(line, x, y);
  };
  renderSection(context, {
    sectionGeometry: g,
    sectionConfig: {
      backgroundColor: '#ffffff',
      elements: [
        {
          id: 'text',
          type: 'text',
          text: 'Hello\nWorld',
          fontId: 'missing',
          fontSize: 0.1,
          color: '#000000',
          align: 'left',
          lineHeight: 1.2,
          transform: {
            position: { x: 0.5, y: 0.5 },
            size: { width: 0.8, height: 0.8 },
            scale: 1,
            rotationDeg: 90,
          },
        },
      ],
    },
    resolvedAssets: new Map(),
    fonts: [],
    pxPerMeter: 100,
  });
  expect(calls).toEqual(['Hello', 'World']);
  expect(context.getTransform().isIdentity).toBe(true);
});
