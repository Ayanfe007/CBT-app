import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Service-role client: server-only. Never pass this to the browser.
// Bypasses RLS — all authorization is enforced in Next.js route handlers.
// We do not throw at import time so `next build` can run without env vars;
// missing env will surface as a runtime error when a route is actually called.
export const supabaseAdmin = createClient(url ?? '', key ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
});
