import { createClient } from '@supabase/supabase-js'

/**
 * Cookie-free Supabase client for use inside `'use cache'` scopes, which cannot
 * call cookies()/headers() (directly or transitively). Only call this for tables
 * whose RLS policy already grants read access to any approved member with no
 * per-row ownership restriction — check supabase/migrations/*.sql first. Every
 * route that reaches a `'use cache'` function using this client is already
 * gated by proxy.ts (unauthenticated/unapproved requests never get this far),
 * so this does not expose anything beyond what an approved member's own
 * session could already read.
 */
export function createCacheClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
