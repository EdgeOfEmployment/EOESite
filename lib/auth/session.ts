import { cache } from 'react'
import { headers } from 'next/headers'
import type { ProfileRole, ProfileStatus } from './access'

export interface SessionProfile {
  userId: string
  role: ProfileRole
  status: ProfileStatus
}

export const ROLES: ProfileRole[] = ['member', 'admin']
export const STATUSES: ProfileStatus[] = ['pending', 'approved', 'rejected']

export function parseSessionHeaders(source: { get(name: string): string | null }): SessionProfile | null {
  const userId = source.get('x-user-id')
  const role = source.get('x-user-role')
  const status = source.get('x-user-status')

  if (!userId || !role || !status) return null
  if (!ROLES.includes(role as ProfileRole)) return null
  if (!STATUSES.includes(status as ProfileStatus)) return null

  return { userId, role: role as ProfileRole, status: status as ProfileStatus }
}

export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  const headerList = await headers()
  return parseSessionHeaders(headerList)
})
