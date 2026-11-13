import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock('./sessions', () => ({ getSession: vi.fn() }));

import { supabaseAdmin } from '@/lib/supabase/admin';
import { finalizeExpiredSessions } from './grading';

const mockFrom = supabaseAdmin.from as unknown as ReturnType<typeof vi.fn>;

describe('finalizeExpiredSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sorts by the real column started_at (starts_at does not exist and made every query fail silently)', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const builder: any = {
      select: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order,
    };
    mockFrom.mockReturnValue(builder);

    await finalizeExpiredSessions();

    expect(mockFrom).toHaveBeenCalledWith('test_sessions');
    expect(order).toHaveBeenCalledWith('started_at', { ascending: true });
  });
});
