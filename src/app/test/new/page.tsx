import { redirect } from 'next/navigation';

export default function NewTestPage() {
  // /test/new must never create sessions or run start logic.
  // Prefetching or reloading this GET page simply returns to the dashboard.
  redirect('/dashboard');
}
