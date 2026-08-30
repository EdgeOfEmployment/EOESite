import { describe, it, expect } from 'vitest'
import { signSessionCache, verifySessionCache } from './session-cache'
import type { SessionProfile } from './session'

const SECRET = 'test-secret'
const session: SessionProfile = { userId: 'u1', role: 'admin', status: 'approved' }

describe('signSessionCache / verifySessionCache', () => {
  it('round-trips a valid session within the TTL', () => {
    const now = 1_000_000
    const token = signSessionCache(session, SECRET, now)
    expect(verifySessionCache(token, SECRET, now + 1000, 5 * 60_000)).toEqual(session)
  })

  it('returns null once the token is older than the TTL', () => {
    const now = 1_000_000
    const ttlMs = 5 * 60_000
    const token = signSessionCache(session, SECRET, now)
    expect(verifySessionCache(token, SECRET, now + ttlMs, ttlMs)).toBeNull()
  })

  it('returns null when the token was signed with a different secret', () => {
    const now = 1_000_000
    const token = signSessionCache(session, SECRET, now)
    expect(verifySessionCache(token, 'wrong-secret', now, 5 * 60_000)).toBeNull()
  })

  it('returns null when the payload has been tampered with', () => {
    const now = 1_000_000
    const token = signSessionCache(session, SECRET, now)
    const [payload, signature] = token.split('.')
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...session, role: 'admin_tampered' })
    ).toString('base64url')
    expect(verifySessionCache(`${tamperedPayload}.${signature}`, SECRET, now, 5 * 60_000)).toBeNull()
  })

  it('returns null for a malformed token', () => {
    expect(verifySessionCache('not-a-valid-token', SECRET, 0, 5 * 60_000)).toBeNull()
  })
})
