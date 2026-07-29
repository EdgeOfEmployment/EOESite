import { describe, it, expect, vi, beforeEach } from 'vitest'

const ADMIN_ID = 'admin-1'
const OTHER_ADMIN_ID = 'admin-2'
const TARGET_ID = 'user-123'

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

import { approveUser, rejectUser } from './actions'

beforeEach(() => {
  vi.clearAllMocks()

  // Caller is authenticated as an admin by default.
  getUserMock.mockResolvedValue({ data: { user: { id: ADMIN_ID } }, error: null })

  // supabase.from('profiles').select('role').eq('id', ...).single() -> role lookup.
  // This chain is used both for the caller's role lookup and the target's role
  // lookup, so route the response by the id being queried.
  roleById = {
    [ADMIN_ID]: 'admin',
    [OTHER_ADMIN_ID]: 'admin',
    [TARGET_ID]: 'member',
  }
  selectEqMock.mockImplementation((_col: string, id: string) => ({
    single: vi.fn().mockResolvedValue({ data: { role: roleById[id] ?? null }, error: null }),
  }))
  selectMock.mockReturnValue({ eq: selectEqMock })

  // supabase.from('profiles').update({ status }).eq('id', ...) -> target profile mutation
  updateEqMock.mockResolvedValue({ error: null })
  updateMock.mockReturnValue({ eq: updateEqMock })

  fromMock.mockReturnValue({ select: selectMock, update: updateMock })
})

describe('approveUser', () => {
  it('sets the profile status to approved and revalidates /admin', async () => {
    await approveUser(TARGET_ID)

    expect(fromMock).toHaveBeenCalledWith('profiles')
    expect(selectEqMock).toHaveBeenCalledWith('id', ADMIN_ID)
    expect(updateMock).toHaveBeenCalledWith({ status: 'approved' })
    expect(updateEqMock).toHaveBeenCalledWith('id', TARGET_ID)
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin')
  })

  it('throws when the update fails', async () => {
    updateEqMock.mockResolvedValue({ error: { message: 'db error' } })

    await expect(approveUser(TARGET_ID)).rejects.toThrow('db error')
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})

describe('rejectUser', () => {
  it('sets the profile status to rejected and revalidates /admin', async () => {
    await rejectUser(TARGET_ID)

    expect(fromMock).toHaveBeenCalledWith('profiles')
    expect(selectEqMock).toHaveBeenCalledWith('id', ADMIN_ID)
    expect(updateMock).toHaveBeenCalledWith({ status: 'rejected' })
    expect(updateEqMock).toHaveBeenCalledWith('id', TARGET_ID)
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin')
  })

  it('throws when the update fails', async () => {
    updateEqMock.mockResolvedValue({ error: { message: 'db error' } })

    await expect(rejectUser(TARGET_ID)).rejects.toThrow('db error')
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})

describe('authorization', () => {
  it('throws when the caller is not an admin, without updating the target', async () => {
    roleById[ADMIN_ID] = 'member'

    await expect(approveUser(TARGET_ID)).rejects.toThrow()

    expect(updateMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('throws when there is no authenticated caller, without updating the target', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null })

    await expect(rejectUser(TARGET_ID)).rejects.toThrow()

    expect(updateMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('throws when an admin tries to act on their own account, without updating', async () => {
    await expect(rejectUser(ADMIN_ID)).rejects.toThrow()

    expect(updateMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('also blocks approving one\'s own account', async () => {
    await expect(approveUser(ADMIN_ID)).rejects.toThrow()

    expect(updateMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('throws when rejecting a different admin, without updating', async () => {
    await expect(rejectUser(OTHER_ADMIN_ID)).rejects.toThrow(
      '다른 관리자의 상태는 변경할 수 없습니다',
    )

    expect(updateMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('throws when approving a different admin, without updating', async () => {
    await expect(approveUser(OTHER_ADMIN_ID)).rejects.toThrow(
      '다른 관리자의 상태는 변경할 수 없습니다',
    )

    expect(updateMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})
