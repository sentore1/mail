import { createClient } from '@supabase/supabase-js';

/**
 * Service role client for server-side operations that bypass RLS
 * Use with caution - only for trusted server-side operations
 */
export const createServiceClient = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
};
