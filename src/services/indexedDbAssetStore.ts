import { normalizeUpload } from './normalizeUpload';
import type { AssetStore } from '@core/contracts';
import type { AssetMetadata } from '@core/config';
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('configurator-assets', 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore('assets', { keyPath: 'metadata.id' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
export function createIndexedDbAssetStore(): AssetStore {
  return {
    async upload(file, context) {
      context?.signal?.throwIfAborted();
      const { blob, width, height } = await normalizeUpload(
        file,
        context?.limits,
      );
      const hash = await crypto.subtle.digest(
        'SHA-256',
        await blob.arrayBuffer(),
      );
      const metadata: AssetMetadata = {
        id: crypto.randomUUID(),
        mimeType: 'image/png',
        byteSize: blob.size,
        widthPx: width,
        heightPx: height,
        sha256: Array.from(new Uint8Array(hash), (b) =>
          b.toString(16).padStart(2, '0'),
        ).join(''),
      };
      context?.signal?.throwIfAborted();
      const db = await openDatabase();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('assets', 'readwrite');
          tx.objectStore('assets').put({ metadata, blob });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
      return metadata;
    },
    async resolve(id, context) {
      context?.signal?.throwIfAborted();
      const db = await openDatabase();
      try {
        return await new Promise<{ metadata: AssetMetadata; blob: Blob }>(
          (resolve, reject) => {
            const request = db
              .transaction('assets')
              .objectStore('assets')
              .get(id);
            request.onsuccess = () =>
              request.result
                ? resolve(
                    request.result as { metadata: AssetMetadata; blob: Blob },
                  )
                : reject(new Error('ASSET_NOT_FOUND'));
            request.onerror = () => reject(request.error);
          },
        );
      } finally {
        db.close();
      }
    },
  };
}
