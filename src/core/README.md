# Core

Product-agnostic schemas and state. Core imports no product definition, renderer or commerce vendor SDK.

- `parseDefinition` parses structure and validates identifiers, references, UV bounds, affine corner maps and physical aspect ratios.
- `loadConfig` accepts v1 objects or JSON (1 MiB text limit); unsupported versions are rejected. No historical migrations exist yet.
- `createConfigStore` owns validated edits, snapshots, transactional undo/redo, and selectors. Returns `{store, actions}`; consumers must mutate through actions.
- `createConfiguratorRuntime` injects pricing, commerce and asset adapters into an independent instance.
- `serializeConfig` canonicalizes option sets and object keys, excludes unused asset metadata and preserves layer order. `fingerprint` hashes that exact representation.
- `assertCurrentQuote` checks response shape, snapshot fingerprint, definition revision and expiry. Monetary amounts are integer minor units; only services calculate totals.

Correctable small-font errors remain editable; invalid structure and references are rejected atomically. Quotes, renderer caches, asset bytes and selection do not serialize. JSON exports require referenced assets in the separate asset store. Never use the preview atlas as print output.

The canopy definition remains a calibration placeholder. Renderer composition, pricing orchestration, real commerce catalog mapping and PDF generation are separate future feature implementations.
