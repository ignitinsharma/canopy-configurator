import type { ProductConfig, AssetMetadata } from './config';
export interface RequestContext {
  signal?: AbortSignal;
}
export interface PriceLine {
  id: string;
  label: string;
  quantity: number;
  unitAmountMinor: number;
  amountMinor: number;
}
export interface PriceQuote {
  quoteId: string;
  configFingerprint: string;
  definitionRevision: string;
  pricingRevision: string;
  currency: string;
  minorUnitDigits: number;
  lineItems: PriceLine[];
  subtotal: number;
  total: number;
  issuedAt: string;
  expiresAt: string;
}
export interface PricingService {
  quote(
    config: ProductConfig,
    context: RequestContext & { currency: string; marketRef: string },
  ): Promise<PriceQuote>;
}
export interface PdfRef {
  documentId: string;
  configFingerprint: string;
  mediaType: 'application/pdf';
}
export interface CartReceipt {
  cartId: string;
  lineIds: string[];
  checkoutUrl: string;
}
export interface CommerceAdapter {
  addToCart(
    config: ProductConfig,
    quote: PriceQuote,
    pdfRef: PdfRef,
    context: RequestContext & { idempotencyKey: string },
  ): Promise<CartReceipt>;
}
export interface AssetStore {
  upload(file: Blob, context?: RequestContext): Promise<AssetMetadata>;
  resolve(
    assetId: string,
    context?: RequestContext,
  ): Promise<{ blob: Blob; metadata: AssetMetadata }>;
}
export interface ConfiguratorDependencies {
  pricing: PricingService;
  commerce: CommerceAdapter;
  assets: AssetStore;
}
