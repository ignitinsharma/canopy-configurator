import { mkdtemp, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
// Exercise emitted JavaScript under Node, without Vite/Vitest module resolution.
const temporary = await mkdtemp(join(tmpdir(), 'canopy-api-runtime-'));
try {
  execFileSync(
    process.execPath,
    [
      fileURLToPath(import.meta.resolve('typescript/lib/tsc.js')),
      '--noEmit',
      'false',
      '--outDir',
      temporary,
    ],
    { stdio: 'inherit' },
  );
  await writeFile(join(temporary, 'package.json'), '{"type":"module"}');
  await symlink(
    resolve('node_modules'),
    join(temporary, 'node_modules'),
    'dir',
  );
  process.env.QUOTE_SIGNING_SECRET = 'runtime-smoke-test-only';
  process.env.MOCK_API_LATENCY_MIN_MS = '0';
  process.env.MOCK_API_LATENCY_MAX_MS = '0';
  const definition = JSON.parse(
    await readFile('src/products/canopy-tent/definition.json', 'utf8'),
  );
  const config = {
    schemaVersion: 1,
    productId: definition.id,
    definitionRevision: definition.revision,
    variantId: '5x5',
    quantity: 1,
    optionSelections: Object.fromEntries(
      definition.optionGroups.map((g) => [g.id, g.defaultValue]),
    ),
    sections: Object.fromEntries(
      definition.sections.map((s) => [
        s.id,
        { backgroundColor: null, elements: [] },
      ]),
    ),
    assets: {},
  };
  const price = (
    await import(pathToFileURL(join(temporary, 'api/price.js')).href)
  ).default;
  const cart = (
    await import(pathToFileURL(join(temporary, 'api/cart.js')).href)
  ).default;
  const request = (path, body) =>
    new Request(`http://localhost/api/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const quoteResponse = await price.fetch(
    request('price', { config, currency: 'USD' }),
  );
  assert.equal(quoteResponse.status, 200);
  const quote = await quoteResponse.json();
  assert.match(quote.signature, /^[a-f0-9]{64}$/);
  const receiptResponse = await cart.fetch(
    request('cart', {
      config,
      quoteId: quote.quoteId,
      signature: quote.signature,
      idempotencyKey: crypto.randomUUID(),
    }),
  );
  assert.equal(receiptResponse.status, 200);
  assert.ok((await receiptResponse.json()).cartId);
  console.log('Emitted Node API runtime: signed quote and cart receipt passed');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
