import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'node:crypto'
import { NextRequest } from 'next/server'

const fromMock = vi.fn()
const upsertMock = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: fromMock })),
}))

import { POST } from './route'

const SECRET = 'test-secret'
const REPO = 'EdgeOfEmployment/Coding-Test'

function sign(body: string) {
  return 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex')
}

function buildRequest(body: string, options: { signature?: string; event?: string } = {}) {
  const signature = options.signature ?? sign(body)
  const event = options.event ?? 'push'
  return new NextRequest('http://localhost/api/github-webhook', {
    method: 'POST',
    headers: {
      'x-hub-signature-256': signature,
      'x-github-event': event,
      'content-type': 'application/json',
    },
    body,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('GITHUB_WEBHOOK_SECRET', SECRET)
  vi.stubEnv('GITHUB_SOURCE_REPO', REPO)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key')
})

describe('POST /api/github-webhook', () => {
  it('rejects a request with an invalid signature', async () => {
    const body = JSON.stringify({
      repository: { full_name: REPO },
      sender: { login: 'kimminsu-dev' },
      commits: [],
    })
    const request = buildRequest(body, { signature: 'sha256=deadbeef' })

    const response = await POST(request)

    expect(response.status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('skips non-push events', async () => {
    const body = JSON.stringify({
      repository: { full_name: REPO },
      sender: { login: 'kimminsu-dev' },
      commits: [],
    })
    const request = buildRequest(body, { event: 'ping' })

    const response = await POST(request)
    const json = await response.json()

    expect(json).toEqual({ ok: true, skipped: 'not a push event' })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('skips a push from an unexpected repository', async () => {
    const body = JSON.stringify({
      repository: { full_name: 'someone-else/unrelated-repo' },
      sender: { login: 'kimminsu-dev' },
      commits: [{ added: ['kimminsu/두 수의 합/두 수의 합.js'], modified: [] }],
    })
    const request = buildRequest(body)

    const response = await POST(request)
    const json = await response.json()

    expect(json).toEqual({ ok: true, skipped: 'unexpected repository' })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('skips when no member is registered with the pusher login', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ ilike: () => ({ maybeSingle: async () => ({ data: null }) }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    })

    const body = JSON.stringify({
      repository: { full_name: REPO },
      sender: { login: 'unregistered-user' },
      commits: [{ added: ['someone/두 수의 합/두 수의 합.js'], modified: [] }],
    })
    const request = buildRequest(body)

    const response = await POST(request)
    const json = await response.json()

    expect(json).toEqual({ ok: true, skipped: 'no matching member' })
  })

  it('auto-checks a problem whose title appears in a changed file path', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({ ilike: () => ({ maybeSingle: async () => ({ data: { id: 'user-1' } }) }) }),
        }
      }
      if (table === 'coding_problems') {
        return {
          select: () =>
            Promise.resolve({
              data: [{ id: 'problem-1', title: '두 수의 합', match_keyword: null }],
            }),
        }
      }
      if (table === 'coding_checks') {
        return { upsert: upsertMock }
      }
      throw new Error(`unexpected table ${table}`)
    })
    upsertMock.mockResolvedValue({ error: null })

    const body = JSON.stringify({
      repository: { full_name: REPO },
      sender: { login: 'kimminsu-dev' },
      commits: [{ added: ['kimminsu/두 수의 합/두 수의 합.js'], modified: [] }],
    })
    const request = buildRequest(body)

    const response = await POST(request)
    const json = await response.json()

    expect(upsertMock).toHaveBeenCalledWith(
      { problem_id: 'problem-1', user_id: 'user-1' },
      { onConflict: 'problem_id,user_id', ignoreDuplicates: true }
    )
    expect(json.checkedProblemIds).toEqual(['problem-1'])
  })

  it('uses match_keyword instead of the title when the admin set one', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({ ilike: () => ({ maybeSingle: async () => ({ data: { id: 'user-1' } }) }) }),
        }
      }
      if (table === 'coding_problems') {
        return {
          select: () =>
            Promise.resolve({
              data: [{ id: 'problem-1', title: '두 수의 합', match_keyword: 'two-sum' }],
            }),
        }
      }
      if (table === 'coding_checks') {
        return { upsert: upsertMock }
      }
      throw new Error(`unexpected table ${table}`)
    })
    upsertMock.mockResolvedValue({ error: null })

    const body = JSON.stringify({
      repository: { full_name: REPO },
      sender: { login: 'kimminsu-dev' },
      commits: [{ added: ['kimminsu/two-sum/two-sum.py'], modified: [] }],
    })
    const request = buildRequest(body)

    await POST(request)

    expect(upsertMock).toHaveBeenCalledWith(
      { problem_id: 'problem-1', user_id: 'user-1' },
      { onConflict: 'problem_id,user_id', ignoreDuplicates: true }
    )
  })
})
