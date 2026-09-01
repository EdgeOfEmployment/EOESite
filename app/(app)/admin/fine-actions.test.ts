import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ADMIN_ID = 'admin-1'
const MEMBER_ID = 'member-1'
const POST_ID = 'post-1'

const selectEqMock = vi.fn()
const selectMock = vi.fn()
const updateEqMock = vi.fn()
const updateMock = vi.fn()
const fromMock = vi.fn()
const getUserMock = vi.fn()
const revalidatePathMock = vi.fn()

let roleById: Record<string, string | null>

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}))

import { setCheckinPostPaid } from './fine-actions'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-02T00:00:00.000Z'))

  getUserMock.mockResolvedValue({ data: { user: { id: ADMIN_ID } }, error: null })

  roleById = { [ADMIN_ID]: 'admin', [MEMBER_ID]: 'member' }
  selectEqMock.mockImplementation((_col: string, id: string) => ({
    single: vi.fn().mockResolvedValue({ data: { role: roleById[id] ?? null }, error: null }),
  }))
  selectMock.mockReturnValue({ eq: selectEqMock })

  updateEqMock.mockResolvedValue({ error: null })
  updateMock.mockReturnValue({ eq: updateEqMock })

  fromMock.mockReturnValue({ select: selectMock, update: updateMock })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('setCheckinPostPaid', () => {
  it('marks a post paid with a timestamp and the caller id, then revalidates', async () => {
    await setCheckinPostPaid(POST_ID, true)

    expect(fromMock).toHaveBeenCalledWith('profiles')
    expect(fromMock).toHaveBeenCalledWith('checkin_posts')
    expect(updateMock).toHaveBeenCalledWith({
      paid: true,
      paid_at: '2026-09-02T00:00:00.000Z',
      paid_by: ADMIN_ID,
    })
    expect(updateEqMock).toHaveBeenCalledWith('id', POST_ID)
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin')
    expect(revalidatePathMock).toHaveBeenCalledWith('/')
  })

  it('marks a post unpaid and clears paid_at/paid_by', async () => {
    await setCheckinPostPaid(POST_ID, false)

    expect(updateMock).toHaveBeenCalledWith({ paid: false, paid_at: null, paid_by: null })
  })

  it('throws when the caller is not an admin, without updating', async () => {
    roleById[ADMIN_ID] = 'member'

    await expect(setCheckinPostPaid(POST_ID, true)).rejects.toThrow('권한이 없습니다')
    expect(updateMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('throws when there is no authenticated caller, without updating', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null })

    await expect(setCheckinPostPaid(POST_ID, true)).rejects.toThrow('권한이 없습니다')
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('throws when the update fails', async () => {
    updateEqMock.mockResolvedValue({ error: { message: 'db error' } })

    await expect(setCheckinPostPaid(POST_ID, true)).rejects.toThrow('db error')
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})
