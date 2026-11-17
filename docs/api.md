# Pricing and cart API

The browser has no catalog prices, surcharge thresholds or discount arithmetic. It sends the complete ProductConfig and formats the PriceQuote. Request/response schemas live in `src/core/contracts.ts` and are imported by both server and client. The pure async engine lives in `server/pricing/engine.ts`; amounts and tier rules live in `server/pricing/rules/canopy-tent.json`.

## Endpoints

Both endpoints require POST JSON, reject unknown fields and cap requests at 1 MiB. Responses use `Cache-Control: no-store`. All amounts are integer USD cents; tax is excluded and calculated by Shopify at checkout. Mock catalog refs map sizes to Shopify variant GIDs 1001/1002/1003.

`POST /api/price` accepts `{ "config": ProductConfig, "currency": "USD" }` and returns the shared PriceQuote schema. Quote lines include kind, quantity, unitAmount, amount and optional metadata. Subtotal is before discounts; discountTotal is positive, its line amount is negative, and total = subtotal - discountTotal. The client validates these relationships but never calculates a price.

`POST /api/cart` accepts `{ "config": ProductConfig, "quoteId": string, "signature": string, "pdfRef"?: { "documentId": string, "configFingerprint": string, "mediaType": "application/pdf" }, "idempotencyKey": string }`. A successful response contains cartId, lineIds, lineItems with mock Shopify variantId/quantity/properties, and a placeholder checkoutUrl. The endpoint never accepts a client total. It validates signature/expiry/full-config hash, recomputes pricing from current rules, checks the optional PDF fingerprint and only then creates the mock receipt.

Quote IDs are opaque `q1.*` tokens containing portable mock claims. HMAC-SHA256 signs exactly `{quoteId, configHash, total, expiresAt, currency}` in that fixed field order. Verification uses timingSafeEqual. Portable IDs let independently deployed price/cart functions work without shared in-memory quote storage. Editing any config field requires a fresh signed quote before cart submission, even when the amount is unchanged.

### Rule semantics

- Base 5x5 / 6.5x6.5 / 8x8 prices: 24900 / 34900 / 44900 cents per tent.
- Included printed sections: 2 / 2 / 4; each extra costs 1500 / 2000 / 2500 cents per tent.
- A section is printed if it has elements or an explicit background different from the selected base fabric color. A matching explicit background or inherited background is not printed by itself.
- Unique referenced uploaded asset IDs count as images; copying one uploaded logo to multiple sections does not multiply the image surcharge. One image is included; extra images cost 1000 / 1200 / 1500 cents per tent.
- At least six printed sections add 2500 / 3500 / 4500 cents per tent.
- Black frame: 2500; sidewalls: 9900; carry bag: 2900 cents per tent. Fabric palette colors are included.
- Standard two-day production is included; one-day rush adds 5000 cents per tent.
- Quantity 1 / 2–4 / 5–9 / 10–100 discounts: 0 / 5 / 10 / 15 percent. They apply to the whole pre-tax subtotal, including options and rush fees, and round once to the nearest cent.
- Low DPI never changes the amount or blocks the mock cart. Warnings reflect the quoted config snapshot. The editor's live DPI warnings still update independently while resizing.

## Quote lifecycle

```mermaid
sequenceDiagram
  participant UI
  participant Price as POST /api/price
  participant Engine as Server rules + HMAC
  participant Cart as POST /api/cart
  UI->>Price: Full ProductConfig + currency (300 ms debounce)
  Price->>Engine: Validate, compute, fingerprint and sign
  Engine-->>UI: Itemized PriceQuote, warnings and expiry
  Note over UI: Movement reuses displayed amount; a changed full config needs a fresh quote before cart
  UI->>Cart: Current config + quoteId + signature + idempotencyKey + optional pdfRef
  Cart->>Engine: Verify signature/expiry/hash and recompute current price
  Engine-->>Cart: Authoritative match
  Cart-->>UI: Mock Shopify-style CartReceipt
```

The hook projects a priceRelevantKey from selections, variant, quantity, backgrounds and element/image membership. Positions, text styling/content and stacking do not trigger pricing requests. It preserves the last total while updating, aborts superseded requests, ignores late completions, refreshes on expiry and keeps 20 quotes in an LRU keyed by full canonical configHash. Manual refresh bypasses the cache. Since a move still changes the full hash, checkout must request a fresh quote for its exact snapshot; the CommerceAdapter rejects stale hashes rather than rebinding signatures in the browser.

## Errors

Errors are `{ "error": { "code": string, "message": string, "details"?: string[] } }`:

| Status | Codes                                                                  |
| ------ | ---------------------------------------------------------------------- |
| 400    | INVALID_JSON, INVALID_REQUEST                                          |
| 405    | METHOD_NOT_ALLOWED                                                     |
| 409    | QUOTE_EXPIRED, QUOTE_MISMATCH, INVALID_SIGNATURE, IDEMPOTENCY_CONFLICT |
| 413    | PAYLOAD_TOO_LARGE                                                      |
| 422    | INVALID_CONFIG, UNSUPPORTED_CURRENCY                                   |
| 500    | SIMULATED_FAILURE, INTERNAL_ERROR                                      |

Example: `{"error":{"code":"QUOTE_MISMATCH","message":"Configuration or pricing rules changed; refresh the quote"}}`.

HttpPricingService retries network failures and 5xx twice with 200/400 ms backoff. It does not retry 4xx or malformed successful responses. AbortSignal cancels transport/backoff. The UI retains the previous amount on errors and offers Retry. No automatic offline checkout is allowed.

## Running and environment

`pnpm dev` and `pnpm preview` both mount the same Web-standard handlers through a Vite transport plugin. API business logic is not duplicated in middleware. `api/price.ts` and `api/cart.ts` use the [Vercel Web Standard fetch export](https://vercel.com/docs/functions/runtimes/node-js). MSW is not started at runtime; tests use injected services/fetchers or invoke the handlers directly.

- `VITE_API_BASE_URL`: public API directory URL, default `/api`; HttpPricingService appends `/price`, CommerceAdapter appends `/cart`.
- `PRICING_SIGNING_SECRET`: server-only HMAC secret. Local Vite dev/preview use the documented development fallback; deployed production functions require this variable. Never prefix it with VITE_.
- `MOCK_API_LATENCY_MIN_MS` / `MOCK_API_LATENCY_MAX_MS`: default 150/300 ms.
- `MOCK_API_FAILURE_RATE`: default 0, use 1 to force failures or 0.25 for intermittent failures.

Stop the current server before changing server environment settings. For example:

```sh
MOCK_API_FAILURE_RATE=1 pnpm dev
# or
MOCK_API_LATENCY_MIN_MS=800 MOCK_API_LATENCY_MAX_MS=1200 pnpm dev
```

For tests, pass `{pricing, commerce, assets}` to ConfiguratorProvider's `dependencies` prop, or to createConfiguratorRuntime. The provider uses the existing runtime factory; tests can supply a fake PricingService without changing UI code.

## Replacing the mock with a real backend / Shopify

Replace computeQuote/rule lookup with authoritative ERP/CRM pricing, Shopify-compatible product/discount logic or Shopify Functions. Keep the public schemas or version them deliberately. Point VITE_API_BASE_URL to the real API or inject another PricingService. The handlers are the transport seam; the UI never receives rules or signing secrets.

Persist quotes/config snapshots, upload artwork/PDFs to remote storage, authenticate assets, and implement durable idempotency before real commerce. The mock's bounded 1000-entry idempotency ledger is process-local and expires with quotes; independent serverless workers cannot guarantee durable deduplication. Quote verification itself is stateless across workers. No real cart is created and the checkout URL is a placeholder. Accessories are mock line properties/quote lines, not independently created Shopify merchandise lines yet. Custom price metadata cannot override Shopify checkout amounts; reconcile actual merchandise/discount pricing before accepting payment.

The Add to cart UI remains disabled for the later commerce/PDF step. Both endpoints and the CommerceAdapter are callable and tested now.

## Full example: three printed sections, two uploaded images, quantity five

The example below is captured from the local handler. Its timestamps/token are illustrative: obtain a fresh quote before replaying the cart flow.

Request:

```json
{
  "config": {
    "schemaVersion": 1,
    "productId": "canopy-tent",
    "definitionRevision": "measured-1",
    "variantId": "6.5x6.5",
    "quantity": 5,
    "optionSelections": {
      "frame-color": "silver",
      "fabric-base-color": "white",
      "accessories": [],
      "production-speed": "standard"
    },
    "sections": {
      "roof-front": {
        "backgroundColor": null,
        "elements": [
          {
            "id": "brand",
            "type": "text",
            "text": "ACME",
            "color": "#17324D",
            "fontId": "inter-regular",
            "fontSize": 0.1,
            "align": "center",
            "lineHeight": 1.2,
            "transform": {
              "position": {
                "x": 0.5,
                "y": 0.65
              },
              "size": {
                "width": 0.6,
                "height": 0.3
              },
              "scale": 1,
              "rotationDeg": 0
            }
          }
        ]
      },
      "valance-front": {
        "backgroundColor": null,
        "elements": [
          {
            "id": "element-logo-a",
            "type": "image",
            "assetId": "logo-a",
            "fit": "contain",
            "opacity": 1,
            "transform": {
              "position": {
                "x": 0.5,
                "y": 0.5
              },
              "size": {
                "width": 0.4,
                "height": 0.5
              },
              "scale": 1,
              "rotationDeg": 0
            }
          }
        ]
      },
      "roof-back": {
        "backgroundColor": null,
        "elements": []
      },
      "valance-back": {
        "backgroundColor": null,
        "elements": [
          {
            "id": "element-logo-b",
            "type": "image",
            "assetId": "logo-b",
            "fit": "contain",
            "opacity": 1,
            "transform": {
              "position": {
                "x": 0.5,
                "y": 0.5
              },
              "size": {
                "width": 0.4,
                "height": 0.5
              },
              "scale": 1,
              "rotationDeg": 0
            }
          }
        ]
      },
      "roof-left": {
        "backgroundColor": null,
        "elements": []
      },
      "valance-left": {
        "backgroundColor": null,
        "elements": []
      },
      "roof-right": {
        "backgroundColor": null,
        "elements": []
      },
      "valance-right": {
        "backgroundColor": null,
        "elements": []
      }
    },
    "assets": {
      "logo-a": {
        "id": "logo-a",
        "mimeType": "image/png",
        "byteSize": 100000,
        "widthPx": 2048,
        "heightPx": 1024,
        "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      "logo-b": {
        "id": "logo-b",
        "mimeType": "image/png",
        "byteSize": 100000,
        "widthPx": 2048,
        "heightPx": 1024,
        "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    }
  },
  "currency": "USD"
}
```

Response (HTTP 200):

```json
{
  "quoteId": "q1.eyJub25jZSI6IjczNjIxMDViLTE3ZmYtNDE5Mi04MGNiLWUzM2NiY2E0YmQ2YyIsImNvbmZpZ0hhc2giOiIzNjg5YTA3ZDY0Nzg0NzZmOGNjOTA1ZDFiNjUwZWJiYjRjYzQ2YjEzNGYwNGMzNDRjM2NlZjBkZWZmNzNhM2VjIiwidG90YWwiOjE3MTQ1MCwiY3VycmVuY3kiOiJVU0QiLCJpc3N1ZWRBdCI6IjIwMjYtMTEtMTdUMTE6NDg6MDYuNjcyWiIsImV4cGlyZXNBdCI6IjIwMjYtMTEtMTdUMTI6MDM6MDYuNjcyWiIsInJ1bGVzVmVyc2lvbiI6Im1vY2stMjAyNi0xMS12MSJ9",
  "currency": "USD",
  "minorUnitDigits": 2,
  "lineItems": [
    {
      "id": "base",
      "label": "6.5x6.5 canopy",
      "kind": "base",
      "quantity": 5,
      "unitAmount": 34900,
      "amount": 174500,
      "meta": {
        "pricingRef": "canopy-base-6.5x6.5",
        "shopifyVariantId": "gid://shopify/ProductVariant/1002"
      }
    },
    {
      "id": "printed-sections",
      "label": "Extra printed sections",
      "kind": "customization",
      "quantity": 5,
      "unitAmount": 2000,
      "amount": 10000,
      "meta": {
        "printedSections": 3,
        "includedPerTent": 2
      }
    },
    {
      "id": "extra-images",
      "label": "Additional uploaded images",
      "kind": "customization",
      "quantity": 5,
      "unitAmount": 1200,
      "amount": 6000,
      "meta": {
        "uniqueImages": 2,
        "includedPerTent": 1
      }
    },
    {
      "id": "option:production-speed:standard",
      "label": "Standard production (2 days)",
      "kind": "fee",
      "quantity": 5,
      "unitAmount": 0,
      "amount": 0,
      "meta": {
        "pricingRef": "production-standard"
      }
    },
    {
      "id": "quantity-discount",
      "label": "Quantity discount (10%)",
      "kind": "discount",
      "quantity": 1,
      "unitAmount": -19050,
      "amount": -19050,
      "meta": {
        "discountBps": 1000
      }
    }
  ],
  "subtotal": 190500,
  "discountTotal": 19050,
  "total": 171450,
  "warnings": [],
  "configHash": "3689a07d6478476f8cc905d1b650ebbb4cc46b134f04c344c3cef0deff73a3ec",
  "expiresAt": "2026-11-17T12:03:06.672Z",
  "issuedAt": "2026-11-17T11:48:06.672Z",
  "signature": "7da0a20c17f8b690d032feadedffbe2b82b1eb70379a4dce6754e0a9a2c65380",
  "rulesVersion": "mock-2026-11-v1",
  "definitionRevision": "measured-1",
  "taxPolicy": "excluded-shopify-checkout"
}
```
