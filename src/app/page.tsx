import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md w-full text-center">
        <h1 className="text-3xl font-bold text-slate-900">Computer-Based Testing</h1>
        <p className="mt-4 text-slate-600">
          Students log in with admin-issued credentials to take assigned tests.
        </p>
        <div className="mt-10 space-y-3">
          <Link
            href="/dashboard"
            className="block w-full py-3 px-4 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700"
          >
            Student Dashboard
          </Link>
          <Link
            href="/admin/login"
            className="block w-full py-3 px-4 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-100"
          >
            Admin Login
          </Link>
        </div>
      </div>
    </div>
  );
}
