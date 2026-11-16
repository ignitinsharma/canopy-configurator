/** Detect iframe presentation mode at page load; no messaging is active yet. */
export function useEmbedMode(): boolean {
  return new URLSearchParams(window.location.search).get('embed') === '1';
}
