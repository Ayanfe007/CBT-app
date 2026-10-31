'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/student/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, pin }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'Invalid login ID or PIN.');
        return;
      }

      const redirect = router;
      redirect.push('/dashboard');
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="w-full max-w-md p-6 bg-white rounded-xl shadow-sm border border-slate-200">
        <h2 className="mb-6 text-2xl font-bold text-slate-900 text-center">Student Login</h2>

        {error && (
          <div className="mb-4 p-3 rounded text-sm text-red-700 bg-red-50 border border-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="loginId" className="block text-sm font-medium text-slate-700">
              Login ID (matric / reg number)
            </label>
            <input
              id="loginId"
              type="text"
              required
              autoComplete="username"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="pin" className="block text-sm font-medium text-slate-700">
              PIN
            </label>
            <input
              id="pin"
              type="password"
              required
              maxLength={6}
              autoComplete="current-password"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-md bg-blue-600 text-white font-semibold disabled:opacity-60 hover:!bg-blue-700"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-sm text-center text-slate-500">
          Your login ID and PIN were given to you by the admin. PINs are 6 digits.
        </p>
      </div>
    </div>
  );
}
