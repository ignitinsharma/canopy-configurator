import { jsPDF } from 'jspdf';
import type { ProductConfig } from '@core/config';
import type { ProductDefinition } from '@core/definition';
import type { PriceQuote, AssetStore } from '@core/contracts';
import { serializeConfig, fingerprint } from '@core/serialization';
import { renderSection } from '@core/render/section';
import { effectiveDpi } from '@core/resolution';
import type { CapturedViews } from '../viewer3d/capture';
export interface SummaryInput {
  config: ProductConfig;
  definition: ProductDefinition;
  quote: PriceQuote;
  assets: AssetStore;
  captureViews: () => Promise<CapturedViews>;
  onProgress?: (message: string) => void;
  makeCanvas?: () => HTMLCanvasElement;
  loadFonts?: (ids: string[]) => Promise<void>;
}
export async function generateSummary({
  config,
  definition,
  quote,
  assets,
  captureViews,
  onProgress = () => {},
  makeCanvas = () => document.createElement('canvas'),
  loadFonts,
}: SummaryInput): Promise<{ blob: Blob; filename: string }> {
  const hash = await fingerprint(config);
  if (hash !== quote.configHash)
    throw new Error('PDF quote does not match current configuration');
  const variant = definition.variants.find((v) => v.id === config.variantId)!;
  const bitmaps = new Map<string, ImageBitmap>(),
    usedFonts = [
      ...new Set(
        Object.values(config.sections).flatMap((s) =>
          s.elements.flatMap((e) => (e.type === 'text' ? [e.fontId] : [])),
        ),
      ),
    ];
  onProgress('Loading artwork and fonts…');
  try {
    await Promise.all(
      [
        ...new Set(
          Object.values(config.sections).flatMap((s) =>
            s.elements.flatMap((e) => (e.type === 'image' ? [e.assetId] : [])),
          ),
        ),
      ].map(async (id) => {
        try {
          const { blob } = await assets.resolve(id);
          bitmaps.set(id, await createImageBitmap(blob));
        } catch {
          /* Shared renderer paints a visible missing-image placeholder. */
        }
      }),
    );
    if (loadFonts) await loadFonts(usedFonts);
    else
      await Promise.all(
        usedFonts.map(async (id) => {
          const f = definition.fonts.find((font) => font.id === id)!;
          const face = await new FontFace(f.family, `url("${f.fileUrl}")`, {
            weight: String(f.weight),
            style: f.style,
          }).load();
          document.fonts.add(face);
          await document.fonts.load(`${f.weight} 16px "${f.family}"`);
        }),
      );
    onProgress('Capturing five 3D views…');
    const views = await captureViews();
    const doc = new jsPDF({ compress: true });
    const money = (amount: number) =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: quote.currency,
      }).format(amount / 10 ** quote.minorUnitDigits);
    let y = 18;
    const text = (value: string, size = 10) => {
      doc.setFontSize(size);
      for (const line of doc.splitTextToSize(value, 186) as string[]) {
        if (y > 280) {
          doc.addPage();
          y = 18;
        }
        doc.text(line, 12, y);
        y += size * 0.43 + 1;
      }
    };
    text('Production summary', 20);
    text(`${definition.name} | ${variant.label} | Quantity ${config.quantity}`);
    text(`Date: ${new Date().toISOString()}`);
    text(`Config hash: ${hash}`, 8);
    text(`Quote: ${quote.quoteId}`, 6);
    text(`Total: ${money(quote.total)} (tax excluded)`, 12);
    const imageTop = Math.max(74, y + 4);
    for (const [i, side] of (
      ['front', 'back', 'left', 'right', 'top'] as const
    ).entries()) {
      const x = 12 + (i % 2) * 96,
        top = imageTop + Math.floor(i / 2) * 57;
      if (top + 54 > 282) {
        doc.addPage();
        y = 18;
        doc.text('3D previews', 12, 18);
        doc.addImage(views[side], 'PNG', 12, 25, 90, 67);
        continue;
      }
      doc.setFontSize(8);
      doc.text(side, x, top);
      doc.addImage(views[side], 'PNG', x, top + 3, 90, 50);
    }
    const value = config.optionSelections['fabric-base-color'],
      baseColor =
        definition.optionGroups
          .find((g) => g.id === 'fabric-base-color')
          ?.choices.find((c) => c.id === value)?.color ?? '#FFFFFF';
    for (const section of definition.sections.filter((s) =>
      s.variantIds.includes(variant.id),
    )) {
      onProgress(`Rendering ${section.label}…`);
      doc.addPage();
      y = 18;
      const g = variant.sectionGeometry[section.id]!,
        content = config.sections[section.id]!;
      text(section.label, 16);
      text(
        `${g.sizeMeters.width.toFixed(3)} × ${g.sizeMeters.height.toFixed(3)} m | ${(g.sizeMeters.width / 0.0254).toFixed(2)} × ${(g.sizeMeters.height / 0.0254).toFixed(2)} in`,
      );
      text(
        `Safe margin: ${section.constraints.safeMarginMeters * 1000} mm; bleed: ${section.constraints.bleedMeters * 1000} mm (unverified defaults).`,
      );
      text(`Background: ${content.backgroundColor ?? baseColor}`);
      // 150 DPI at the preview's printed PDF-page dimensions, not a full-size fabric print master.
      const ppm = Math.min(
          1122 / g.sizeMeters.width,
          827 / g.sizeMeters.height,
        ),
        canvas = makeCanvas();
      canvas.width = Math.ceil(g.sizeMeters.width * ppm);
      canvas.height = Math.ceil(g.sizeMeters.height * ppm);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('PDF canvas unavailable');
      renderSection(ctx, {
        sectionGeometry: g,
        sectionConfig: content,
        resolvedAssets: bitmaps,
        fonts: definition.fonts,
        pxPerMeter: ppm,
        baseColor,
      });
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
      const width = (canvas.width / 150) * 25.4,
        height = (canvas.height / 150) * 25.4;
      doc.addImage(
        canvas.toDataURL('image/jpeg', 0.85),
        'JPEG',
        12,
        y + 2,
        width,
        height,
      );
      y += height + 10;
      for (const e of content.elements)
        if (e.type === 'text')
          text(
            `Text: ${e.text} | Font: ${definition.fonts.find((f) => f.id === e.fontId)?.family ?? e.fontId} | ${e.color} | Size ${(e.fontSize * 100).toFixed(1)}%`,
          );
        else {
          const asset = config.assets[e.assetId];
          text(
            `Image: ${asset?.name ?? e.assetId} | ${asset?.widthPx ?? '?'} × ${asset?.heightPx ?? '?'} px | ${asset ? effectiveDpi(asset, e, g).toFixed(0) : '?'} DPI${bitmaps.has(e.assetId) ? '' : ' | MISSING ASSET'}`,
          );
        }
      canvas.width = canvas.height = 0;
    }
    doc.addPage();
    y = 18;
    text('Price breakdown and options', 18);
    for (const line of quote.lineItems)
      text(`${line.label} × ${line.quantity}: ${money(line.amount)}`);
    text(
      `Subtotal ${money(quote.subtotal)} | Discounts ${money(quote.discountTotal)} | Total ${money(quote.total)}`,
    );
    text('Tax is calculated by Shopify at checkout.');
    for (const [key, value] of Object.entries(config.optionSelections))
      text(`${key}: ${Array.isArray(value) ? value.join(', ') : value}`);
    for (const warning of quote.warnings) text(`Warning: ${warning.message}`);
    const canonical = serializeConfig(config),
      bytes = new TextEncoder().encode(canonical);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const encoded = btoa(binary);
    doc.setProperties({
      title: `Order ${hash.slice(0, 8)}`,
      subject: `ProductConfigBase64:${encoded}`,
      keywords: `configHash:${hash}`,
      creator: 'Canopy configurator',
    });
    text(
      'Machine-readable config: PDF Subject metadata contains ProductConfigBase64: followed by base64 UTF-8 JSON. Decode it to recover the complete configuration.',
      8,
    );
    text(
      'Section previews are 150 DPI on the PDF page, not full-size fabric print masters. Original uploads are normalized to 2048 pixels.',
      8,
    );
    for (let page = 1; page <= doc.getNumberOfPages(); page++) {
      doc.setPage(page);
      doc.setFontSize(7);
      doc.text(`${hash} | ${page}/${doc.getNumberOfPages()}`, 12, 291);
    }
    onProgress('Saving PDF…');
    return {
      blob: doc.output('blob'),
      filename: `order-${hash.slice(0, 8)}.pdf`,
    };
  } finally {
    bitmaps.forEach((bitmap) => bitmap.close());
  }
}
