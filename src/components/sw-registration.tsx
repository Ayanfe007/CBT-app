'use client';

import { useEffect } from 'react';

export default function SWRegistration() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
          // Service worker registration is non-fatal.
        });
      });
    }
  }, []);
  return null;
}
