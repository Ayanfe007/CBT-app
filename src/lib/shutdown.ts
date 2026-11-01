/**
 * Kill switch for offline features.
 * Set NEXT_PUBLIC_DISABLE_OFFLINE=1 in Vercel env vars to disable IndexedDB,
 * service worker registration, and heartbeat/pause logic.
 */
export function isOfflineDisabled(): boolean {
  if (typeof process === 'undefined') return false;
  return process.env.NEXT_PUBLIC_DISABLE_OFFLINE === '1';
}
