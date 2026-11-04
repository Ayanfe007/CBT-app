'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { startTestSchema } from '@/lib/validators';

interface CourseStartButtonProps {
  course: {
    id: string;
    course_code: string;
    title: string;
    status: 'not_started' | 'in_progress' | 'completed';
    is_active: boolean;
    attempts_used: number;
    max_attempts: number;
  };
}

export default function CourseStartButton({ course }: CourseStartButtonProps) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const inFlight = useRef(false);

  const handleStart = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setStarting(true);
    setStartError('');

    try {
      const parsed = startTestSchema.safeParse({ courseId: course.id });
      if (!parsed.success) {
        setStartError('Invalid course ID.');
        return;
      }

      const res = await fetch('/api/test/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: course.id }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStartError(json.error || 'Could not start test.');
        return;
      }

      const sessionId = json.sessionId;
      if (!sessionId) {
        setStartError('No session returned.');
        return;
      }

      router.push(`/test/${sessionId}`);
    } catch (err: any) {
      setStartError(err.message || 'Could not start test.');
    } finally {
      setStarting(false);
      inFlight.current = false;
    }
  }, [course.id, router]);

  const label = course.status === 'in_progress' ? 'Resume Test' : 'Start Test';

  return (
    <div className="space-y-2">
      <button
        onClick={handleStart}
        disabled={starting}
        className="w-full py-3 px-4 rounded-lg bg-blue-600 text-white font-semibold text-center hover:bg-blue-700 disabled:opacity-60 transition"
      >
        {starting ? 'Starting…' : label}
      </button>
      {startError && (
        <div className="mt-2 p-2 rounded bg-red-50 text-red-700 text-sm border border-red-100">
          {startError}
          <button
            onClick={handleStart}
            disabled={starting}
            className="ml-2 text-xs underline hover:text-red-900 disabled:opacity-50"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
