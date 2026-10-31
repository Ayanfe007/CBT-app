import './globals.css';
import type { Metadata } from 'next';
import SWRegistration from '@/components/sw-registration';

export const metadata: Metadata = {
  title: 'CBT — Computer-Based Testing',
  description: 'Admin-controlled computer-based testing for schools',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <SWRegistration />
        {children}
      </body>
    </html>
  );
}
