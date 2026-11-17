# Pricing

PriceBar requests a quote via the injected PricingService and only formats returned amounts. usePriceQuote debounces relevant edits, cancels requests, ignores late responses, preserves the previous total, refreshes expired quotes and caches 20 full-config hashes. Layout/style changes do not reprice. A fresh exact-config signed quote is required before cart submission. See docs/api.md for contracts and backend configuration.
