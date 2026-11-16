# Canopy configurator

## Overview

Private technical-test foundation for an embeddable, reusable product configurator. Only the responsive shell and tooling are implemented. Editing, rendering, pricing, cart, PDF and messaging remain placeholders.

## Architecture

`src/core` will contain the product-agnostic engine, schema, store and integration contracts. `src/products/<product>` owns product-specific JSON. Features compose the engine; services adapt external systems; UI owns shared presentation. Each directory documents its future responsibility.

## Config data model

Placeholder: define the Zod schema and serializable configuration contract before populating `products/canopy-tent/definition.json`.

## Pricing and Shopify integration

Placeholder: define PricingService and CommerceAdapter contracts in core, then implement MSW-backed `/api/price` and `/api/cart` adapters. No requests or Shopify integration are active.

## 2D/3D sync

Placeholder: one shared configuration will drive the future Konva editor and react-three-fiber preview. Coordinate mapping and update rules remain to be designed.

## Embedding (iframe + postMessage)

Append `?embed=1` to hide page header/footer. Example: `<iframe src="http://localhost:5173/?embed=1" title="Product configurator" width="100%" height="720"></iframe>`.

Placeholder: define message contracts, allowed origins and resize behavior before implementing postMessage. Query mode is read on page load; reload after changing it.

## Performance

Placeholder: establish asset budgets, lazy-load feature modules and measure rendering performance. Heavy graphics libraries are installed but not loaded by the scaffold. `public/models` is reserved for approved optimized models.

## Running locally

Use Node 22.23.1 and pnpm 10.32.1 (the packageManager field pins pnpm for CI).

```sh
corepack enable
corepack prepare pnpm@10.32.1 --activate
pnpm install --frozen-lockfile
pnpm dev
```

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm preview
pnpm format
```

Below 900px the workspace uses Options / 2D / 3D view buttons and a pinned price bar. Checkout remains disabled.

## Key decisions

- React 18 with compatible Fiber 8, Drei 9 and react-konva 18 release lines.
- Strict TypeScript with unchecked index access enabled; aliases mirror architectural boundaries.
- Product definitions are JSON; core must stay product-agnostic.
- CSS variables provide theming without a UI library.
- Original confidential GLBs and PDFs stay in ignored `assets-source/`; they are never copied to the public directory automatically. Place existing originals there locally; none are supplied by this scaffold.
- The GitHub repository must remain private. No deployment is configured.
