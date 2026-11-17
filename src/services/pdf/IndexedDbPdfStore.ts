import type { PdfStore, PdfRef } from '@core/contracts';
/** Mock refs are local blob URLs, not portable fulfillment URLs. Swap this adapter
 * for authenticated remote storage before using real Shopify orders. */
export function createIndexedDbPdfStore(): PdfStore {
  const urls = new Set<string>();
  return {
    async upload(blob, { configHash, filename }) {
      const digest = await crypto.subtle.digest(
          'SHA-256',
          await blob.arrayBuffer(),
        ),
        sha256 = Array.from(new Uint8Array(digest), (b) =>
          b.toString(16).padStart(2, '0'),
        ).join(''),
        id = `pdf-${sha256.slice(0, 24)}`;
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('configurator-pdfs', 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore('pdfs', { keyPath: 'id' });
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction('pdfs', 'readwrite');
          tx.objectStore('pdfs').put({
            id,
            blob,
            filename,
            sha256,
            configHash,
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      });
      const url = URL.createObjectURL(blob);
      urls.add(url);
      const ref: PdfRef = {
        id,
        documentId: id,
        url,
        sha256,
        configFingerprint: configHash,
        mediaType: 'application/pdf',
      };
      return ref;
    },
    dispose() {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    },
  };
}
