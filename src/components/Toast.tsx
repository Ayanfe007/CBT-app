'use client';

import { useCallback, useState } from 'react';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export function Toast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((type: Toast['type'], message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-200 ${
            t.type === 'success'
              ? 'bg-green-900 text-green-100 border border-green-700'
              : t.type === 'error'
              ? 'bg-red-900 text-red-100 border border-red-700'
              : 'bg-blue-900 text-blue-100 border border-blue-700'
          }`}
        >
          <span className={t.type === 'success' ? 'text-green-400' : t.type === 'error' ? 'text-red-400' : 'text-blue-400'}>
            {t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}
          </span>
          <span className={t.type === 'success' ? 'text-green-100' : t.type === 'error' ? 'text-red-100' : 'text-blue-100'}>
            {t.message}
          </span>
          <button
            onClick={() => dismiss(t.id)}
            className={`ml-2 opacity-60 hover:opacity-100 ${t.type === 'success' ? 'hover:text-green-200' : t.type === 'error' ? 'hover:text-red-200' : 'hover:text-blue-200'}`}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
