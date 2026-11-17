import { readFile, writeFile } from 'node:fs/promises';
const file = new URL('../vercel.json', import.meta.url),
  config = JSON.parse(await readFile(file, 'utf8'));
const raw = process.env.VITE_ALLOWED_PARENT_ORIGINS ?? '',
  origins = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
for (const origin of origins) {
  const parsed = new URL(origin);
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.origin !== origin
  )
    throw new Error('Use exact HTTP(S) parent origins, never * or paths');
}
const csp = `frame-ancestors 'self'${origins.length ? ' ' + origins.join(' ') : ''}`;
config.headers.find((h) => h.source === '/(.*)').headers = [
  { key: 'Content-Security-Policy', value: csp },
];
await writeFile(file, JSON.stringify(config, null, 2) + '\n');
console.log(`Prepared CSP: ${csp}`);
