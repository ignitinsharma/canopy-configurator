import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, Connect } from 'vite';
import { createApiHandlers, errorResponse } from './handlers/api';
/** Only transports bytes. All request validation/business logic stays in handlers. */
export function pricingApiPlugin(env: Record<string, string>): Plugin {
  const handlers = createApiHandlers({
    env,
    secret: env.PRICING_SIGNING_SECRET ?? 'canopy-local-development-secret',
  });
  const middleware: Connect.NextHandleFunction = (
    req: IncomingMessage,
    res: ServerResponse,
    next,
  ) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (!pathname.startsWith('/api/')) return next();
    void (async () => {
      try {
        const chunks: Buffer[] = [];
        let bytes = 0;
        for await (const chunk of req) {
          const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytes += value.byteLength;
          if (bytes > 1048576) {
            const response = errorResponse(
              413,
              'PAYLOAD_TOO_LARGE',
              'Request exceeds 1 MiB',
            );
            res.writeHead(
              response.status,
              Object.fromEntries(response.headers),
            );
            res.end(await response.text());
            return;
          }
          chunks.push(value);
        }
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (value)
            headers.set(key, Array.isArray(value) ? value.join(',') : value);
        }
        const method = req.method ?? 'GET';
        const request = new Request(`http://localhost${req.url}`, {
          method,
          headers,
          ...(!['GET', 'HEAD'].includes(method)
            ? { body: Buffer.concat(chunks).toString('utf8') }
            : {}),
        });
        const response =
          pathname === '/api/price'
            ? await handlers.price(request)
            : pathname === '/api/cart'
              ? await handlers.cart(request)
              : errorResponse(404, 'NOT_FOUND', 'Unknown API endpoint');
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(await response.text());
      } catch {
        if (!res.headersSent)
          res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: { code: 'INTERNAL_ERROR', message: 'API transport failed' },
          }),
        );
      }
    })();
  };
  return {
    name: 'local-pricing-api',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
