import { createHmac, timingSafeEqual } from 'node:crypto'
import { ROLES, STATUSES, type SessionProfile } from './session'

export const SESSION_CACHE_COOKIE = 'eoe-session-cache'
export const SESSION_CACHE_TTL_MS = 5 * 60_000

interface CachedPayload extends SessionProfile {
  issuedAt: number
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function signSessionCache(session: SessionProfile, secret: string, now: number): string {
  const payload: CachedPayload = { ...session, issuedAt: now }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encodedPayload}.${sign(encodedPayload, secret)}`
}

export function verifySessionCache(
  token: string,
  secret: string,
  now: number,
  ttlMs: number
): SessionProfile | null {
  const [encodedPayload, signature] = token.split('.')
  if (!encodedPayload || !signature) return null

  const expectedSignature = sign(encodedPayload, secret)
  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null
  }

  let payload: CachedPayload
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8'))
  } catch {
    return null
  }

  if (now - payload.issuedAt >= ttlMs) return null
  if (typeof payload.userId !== 'string' || !payload.userId) return null
  if (!ROLES.includes(payload.role)) return null
  if (!STATUSES.includes(payload.status)) return null

  return { userId: payload.userId, role: payload.role, status: payload.status }
}
