# Canopy configurator

## Overview

Private technical-test foundation for an embeddable, reusable product configurator. The responsive shell, core data layer, service contracts/adapters and measured canopy definition are implemented. The demand-rendered 3D viewer is wired to size/color/section controls. 2D editing, artwork compositing, mock endpoint behavior, PDF and messaging remain future work.

## Architecture

`src/core` will contain the product-agnostic engine, schema, store and integration contracts. `src/products/<product>` owns product-specific JSON. Features compose the engine; services adapt external systems; UI owns shared presentation. Each directory documents its future responsibility.

## Config data model

Strict Zod schemas define the serializable configuration and product definition. The canopy definition contains three measured sizes with eight printable sections each. Atlas rectangles use top-origin normalized bounds, quarter-turn content rotations and meter dimensions. Printable triangle interiors, rather than overlapping roof bounding rectangles, are checked for overlap.

## Pricing and Shopify integration

PricingService, CommerceAdapter and AssetStore contracts are implemented with injectable HTTP pricing/cart adapters and an IndexedDB image store. MSW endpoint behavior and production Shopify mappings remain pending. Nothing is wired into the shell yet.

## 2D/3D sync

The 3D preview reads the shared Zustand config. Selection uses clipped UV polygons and updates the same store. The Konva editor and artwork compositor remain future work.

## Embedding (iframe + postMessage)

Append `?embed=1` to hide page header/footer. Example: `<iframe src="http://localhost:5173/?embed=1" title="Product configurator" width="100%" height="720"></iframe>`.

Placeholder: define message contracts, allowed origins and resize behavior before implementing postMessage. Query mode is read on page load; reload after changing it.

## Performance

Placeholder: establish asset budgets, lazy-load feature modules and measure rendering performance. The viewer and graphics libraries live in a separate lazy-loaded chunk. `public/models` is reserved for approved optimized models.

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

## Model optimization and viewer verification

Place original GLBs in ignored `assets-source/`, then run `pnpm optimize:models`. The script preserves node/material names, removes only printable baseColor artwork, keeps normal/roughness and frame maps, converts remaining textures to WebP (maximum 1024 square), applies Draco compression and copies its decoder locally. Optimized GLBs and decoder assets are committed; CI does not require confidential originals.

Open `/?debug=atlas` to verify all sizes and sections using the Options controls. See `src/features/viewer3d/README.md` for the capture API, ownership/disposal rules and iframe hosting requirements.
