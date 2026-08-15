import { describe, it, expect } from 'vitest'
import { parseSessionHeaders } from './session'

function headersFrom(map: Record<string, string>) {
  return { get: (name: string) => map[name] ?? null }
}

describe('parseSessionHeaders', () => {
  it('returns null when headers are missing', () => {
    expect(parseSessionHeaders(headersFrom({}))).toBeNull()
  })

  it('returns null when role is not a known value', () => {
    const source = headersFrom({ 'x-user-id': 'u1', 'x-user-role': 'superuser', 'x-user-status': 'approved' })
    expect(parseSessionHeaders(source)).toBeNull()
  })

  it('returns null when status is not a known value', () => {
    const source = headersFrom({ 'x-user-id': 'u1', 'x-user-role': 'admin', 'x-user-status': 'banned' })
    expect(parseSessionHeaders(source)).toBeNull()
  })

  it('parses a valid header set', () => {
    const source = headersFrom({ 'x-user-id': 'u1', 'x-user-role': 'admin', 'x-user-status': 'approved' })
    expect(parseSessionHeaders(source)).toEqual({ userId: 'u1', role: 'admin', status: 'approved' })
  })
})
