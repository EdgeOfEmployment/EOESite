import { describe, it, expect, vi } from 'vitest'
import { getVerifiedUser } from './verify'

function clientReturning(result: { data: { claims: { sub: string } } | null }) {
  return { auth: { getClaims: vi.fn().mockResolvedValue(result) } }
}

describe('getVerifiedUser', () => {
  it('returns the subject of a verified token', async () => {
    expect(await getVerifiedUser(clientReturning({ data: { claims: { sub: 'user-1' } } }))).toEqual({
      id: 'user-1',
    })
  })

  it('returns null when the token is missing or fails verification', async () => {
    expect(await getVerifiedUser(clientReturning({ data: null }))).toBeNull()
  })
})
