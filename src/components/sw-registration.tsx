'use client';

import { useEffect } from 'react';
import { isOfflineDisabled } from '@/lib/shutdown';

export default function SWRegistration() {
  useEffect(() => {
    // Kill switch: skip service worker entirely when offline features are disabled.
    if (isOfflineDisabled()) {
      // Try to unregister any existing worker from a previous deploy.
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          registrations.forEach((reg) => reg.unregister());
        });
      }
      return;
    }

    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            // Force update so new cache version takes effect immediately.
            reg.update();
          })
          .catch(() => {
            // Service worker registration is non-fatal.
          });
      });
    }
  }, []);
  return null;
}
