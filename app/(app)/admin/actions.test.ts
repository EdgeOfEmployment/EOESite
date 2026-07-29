import { describe, it, expect, vi, beforeEach } from 'vitest'

const eqMock = vi.fn()
const updateMock = vi.fn()
const fromMock = vi.fn()
const revalidatePathMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: fromMock })),
}))

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}))

import { approveUser, rejectUser } from './actions'

beforeEach(() => {
  vi.clearAllMocks()
  eqMock.mockResolvedValue({ error: null })
  updateMock.mockReturnValue({ eq: eqMock })
  fromMock.mockReturnValue({ update: updateMock })
})

describe('approveUser', () => {
  it('sets the profile status to approved and revalidates /admin', async () => {
    await approveUser('user-123')

    expect(fromMock).toHaveBeenCalledWith('profiles')
    expect(updateMock).toHaveBeenCalledWith({ status: 'approved' })
    expect(eqMock).toHaveBeenCalledWith('id', 'user-123')
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin')
  })
})

describe('rejectUser', () => {
  it('sets the profile status to rejected and revalidates /admin', async () => {
    await rejectUser('user-456')

    expect(fromMock).toHaveBeenCalledWith('profiles')
    expect(updateMock).toHaveBeenCalledWith({ status: 'rejected' })
    expect(eqMock).toHaveBeenCalledWith('id', 'user-456')
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin')
  })

  it('throws when the update fails', async () => {
    eqMock.mockResolvedValue({ error: { message: 'db error' } })

    await expect(rejectUser('user-789')).rejects.toThrow('db error')
  })
})
