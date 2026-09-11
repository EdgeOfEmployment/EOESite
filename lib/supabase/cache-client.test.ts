import { describe, it, expect, vi } from 'vitest'

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(() => ({ marker: 'service-role-client' })),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}))

import { createCacheClient } from './cache-client'

describe('createCacheClient', () => {
  it('builds a client with the service-role key, not the anon key', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret'

    createCacheClient()

    expect(createClientMock).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'service-role-secret'
    )
  })
})
