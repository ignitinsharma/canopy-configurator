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
      if (
        file.size > 10485760 ||
        !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
      )
        throw new Error('INVALID_ASSET');
      const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      const actual =
        signature[0] === 137 &&
        signature[1] === 80 &&
        signature[2] === 78 &&
        signature[3] === 71
          ? 'image/png'
          : signature[0] === 255 && signature[1] === 216
            ? 'image/jpeg'
            : String.fromCharCode(...signature.slice(0, 4)) === 'RIFF' &&
                String.fromCharCode(...signature.slice(8, 12)) === 'WEBP'
              ? 'image/webp'
              : null;
      if (actual !== file.type) throw new Error('INVALID_ASSET');
      const image = await createImageBitmap(file, {
        imageOrientation: 'from-image',
      });
      try {
        if (
          image.width > 8192 ||
          image.height > 8192 ||
          image.width * image.height > 40000000
        )
          throw new Error('IMAGE_TOO_LARGE');
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('CANVAS_UNAVAILABLE');
        ctx.drawImage(image, 0, 0);
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('ENCODE_FAILED'))),
            'image/png',
          ),
        );
        if (blob.size > 10485760) throw new Error('IMAGE_TOO_LARGE');
        const hash = await crypto.subtle.digest(
          'SHA-256',
          await blob.arrayBuffer(),
        );
        const metadata: AssetMetadata = {
          id: crypto.randomUUID(),
          mimeType: 'image/png',
          byteSize: blob.size,
          widthPx: image.width,
          heightPx: image.height,
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
      } finally {
        image.close();
      }
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
