import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ADMIN_ID = 'admin-1'
const MEMBER_ID = 'member-1'
const POST_ID = 'post-1'

const selectMock = vi.fn()
const updateEqMock = vi.fn()
const updateMock = vi.fn()
const insertMock = vi.fn()
const fromMock = vi.fn()
const getUserMock = vi.fn()
const revalidatePathMock = vi.fn()

let roleById: Record<string, string | null>
let statusById: Record<string, string | null>

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}))

import { setCheckinPostPaid, cancelCheckinFine, addManualFine } from './fine-actions'

function manualFineFormData(fields: Partial<Record<'userId' | 'amount' | 'reason', string>>): FormData {
  const formData = new FormData()
  formData.set('userId', fields.userId ?? MEMBER_ID)
  formData.set('amount', fields.amount ?? '5000')
  formData.set('reason', fields.reason ?? '지각 3회 누적')
  return formData
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-02T00:00:00.000Z'))

  getUserMock.mockResolvedValue({ data: { user: { id: ADMIN_ID } }, error: null })

  roleById = { [ADMIN_ID]: 'admin', [MEMBER_ID]: 'member' }
  statusById = { [MEMBER_ID]: 'approved' }
  selectMock.mockImplementation((columns: string) => ({
    eq: (_col: string, id: string) => ({
      single: vi.fn().mockResolvedValue(
        columns === 'status'
          ? { data: { status: statusById[id] ?? null }, error: null }
          : { data: { role: roleById[id] ?? null }, error: null }
      ),
    }),
  }))

  updateEqMock.mockResolvedValue({ error: null })
  updateMock.mockReturnValue({ eq: updateEqMock })

  insertMock.mockResolvedValue({ error: null })

  fromMock.mockReturnValue({ select: selectMock, update: updateMock, insert: insertMock })
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

describe('cancelCheckinFine', () => {
  it('zeroes the fine amount and revalidates', async () => {
    await cancelCheckinFine(POST_ID)

    expect(fromMock).toHaveBeenCalledWith('checkin_posts')
    expect(updateMock).toHaveBeenCalledWith({ fine_amount: 0 })
    expect(updateEqMock).toHaveBeenCalledWith('id', POST_ID)
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin')
    expect(revalidatePathMock).toHaveBeenCalledWith('/')
  })

  it('throws when the caller is not an admin, without updating', async () => {
    roleById[ADMIN_ID] = 'member'

    await expect(cancelCheckinFine(POST_ID)).rejects.toThrow('권한이 없습니다')
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('throws when the update fails', async () => {
    updateEqMock.mockResolvedValue({ error: { message: 'db error' } })

    await expect(cancelCheckinFine(POST_ID)).rejects.toThrow('db error')
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})

describe('addManualFine', () => {
  it('inserts a manual fine for an approved member and revalidates', async () => {
    await addManualFine(manualFineFormData({}))

    expect(fromMock).toHaveBeenCalledWith('manual_fines')
    expect(insertMock).toHaveBeenCalledWith({
      user_id: MEMBER_ID,
      amount: 5000,
      reason: '지각 3회 누적',
      created_by: ADMIN_ID,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin')
    expect(revalidatePathMock).toHaveBeenCalledWith('/')
  })

  it('throws when the caller is not an admin, without inserting', async () => {
    roleById[ADMIN_ID] = 'member'

    await expect(addManualFine(manualFineFormData({}))).rejects.toThrow('권한이 없습니다')
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('throws when no member is selected', async () => {
    await expect(addManualFine(manualFineFormData({ userId: '' }))).rejects.toThrow('대상 멤버를 선택해주세요')
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('throws when the amount is not a positive integer', async () => {
    await expect(addManualFine(manualFineFormData({ amount: '0' }))).rejects.toThrow(
      '금액은 1 이상의 정수여야 합니다'
    )
    await expect(addManualFine(manualFineFormData({ amount: 'abc' }))).rejects.toThrow(
      '금액은 1 이상의 정수여야 합니다'
    )
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('throws when the reason is blank', async () => {
    await expect(addManualFine(manualFineFormData({ reason: '   ' }))).rejects.toThrow('사유를 입력해주세요')
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('throws when the target member is not approved', async () => {
    statusById[MEMBER_ID] = 'pending'

    await expect(addManualFine(manualFineFormData({}))).rejects.toThrow(
      '승인된 멤버에게만 벌금을 부과할 수 있습니다'
    )
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('throws when the insert fails', async () => {
    insertMock.mockResolvedValue({ error: { message: 'db error' } })

    await expect(addManualFine(manualFineFormData({}))).rejects.toThrow('db error')
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})
