'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/courses', label: 'Courses' },
  { href: '/admin/questions', label: 'Questions' },
  { href: '/admin/students', label: 'Students' },
  { href: '/admin/assignments', label: 'Assignments' },
  { href: '/admin/results', label: 'Results' },
  { href: '/admin/live-monitor', label: 'Live Monitor' },
] as const;

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <aside className="w-64 bg-slate-900 text-white shrink-0 flex flex-col">
        <div className="p-6">
          <div className="font-bold text-xl tracking-tight">CBT&nbsp;Admin</div>
          <p className="text-xs text-slate-400 mt-1">Computer-Based Testing</p>
        </div>
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2.5 text-sm rounded-lg ${
                pathname === item.href
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-800">
          <form
            action="/api/auth/admin/logout"
            method="POST"
            onSubmit={(e) => {
              e.preventDefault();
              fetch('/api/auth/admin/logout', { method: 'POST' }).then(() => {
                window.location.href = '/admin/login';
              });
            }}
            className="space-y-2"
          >
            <button
              type="submit"
              className="w-full py-2 px-3 rounded-lg text-sm text-red-300 hover:bg-red-500/10 hover:text-red-200 transition"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto bg-slate-100 p-6">
        <div className="max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
