// @vitest-environment node
import { it, expect } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { generateSummary } from './generateSummary';
import {
  blankConfig,
  fixtureDefinition,
} from '../../../server/pricing/fixtures';
import { computeQuote } from '../../../server/pricing/engine';
import { canopyRules } from '../../../server/pricing/rules';
it('generates a PDF Blob with section pages, config metadata and deterministic filename', async () => {
  const config = blankConfig(),
    quote = await computeQuote(config, canopyRules, {
      definition: fixtureDefinition,
      currency: 'USD',
      now: Date.now(),
      quoteId: 'smoke',
      secret: 'test',
    });
  const canvas = createCanvas(20, 20);
  canvas.getContext('2d').fillRect(0, 0, 20, 20);
  const image = canvas.toDataURL('image/png');
  const result = await generateSummary({
    config,
    definition: fixtureDefinition,
    quote,
    assets: {
      upload: async () => {
        throw new Error('unused');
      },
      resolve: async () => {
        throw new Error('unused');
      },
    },
    captureViews: async () => ({
      front: image,
      back: image,
      left: image,
      right: image,
      top: image,
    }),
    makeCanvas: () => createCanvas(1, 1) as unknown as HTMLCanvasElement,
  });
  expect(result.blob).toBeInstanceOf(Blob);
  expect(
    new TextDecoder().decode(await result.blob.slice(0, 4).arrayBuffer()),
  ).toBe('%PDF');
  expect(result.filename).toBe(`order-${quote.configHash.slice(0, 8)}.pdf`);
  expect(await result.blob.text()).toContain('ProductConfigBase64:');
});
