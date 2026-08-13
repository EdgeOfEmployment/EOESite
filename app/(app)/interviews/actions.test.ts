import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUserMock = vi.fn()
const fromMock = vi.fn()
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})
const revalidatePathMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}))

import { createSession, toggleParticipation, deleteSession } from './actions'

function buildFormData(fields: Record<string, FormDataEntryValue>) {
  const formData = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value)
  }
  return formData
}

beforeEach(() => {
  vi.clearAllMocks()
  redirectMock.mockImplementation((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  })
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } })
})

describe('createSession', () => {
  function mockInsert({ insertError = null }: { insertError?: { message: string } | null } = {}) {
    const insert = vi.fn().mockResolvedValue({ error: insertError })
    fromMock.mockImplementation((table: string) => {
      if (table === 'interview_sessions') return { insert }
      throw new Error(`unexpected table ${table}`)
    })
    return { insert }
  }

  it('redirects with an error when the title is missing', async () => {
    const formData = buildFormData({ title: '', sessionAt: '2026-08-20T14:00' })

    await expect(createSession(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith('/interviews?error=' + encodeURIComponent('제목과 일시를 입력해주세요'))
  })

  it('redirects with an error when the date/time is missing', async () => {
    const formData = buildFormData({ title: '2조 모의면접', sessionAt: '' })

    await expect(createSession(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith('/interviews?error=' + encodeURIComponent('제목과 일시를 입력해주세요'))
  })

  it('creates a session with the given title, time, and description', async () => {
    const { insert } = mockInsert()
    const formData = buildFormData({
      title: '2조 모의면접',
      sessionAt: '2026-08-20T14:00',
      description: 'Zoom 링크',
    })

    await createSession(formData)

    expect(insert).toHaveBeenCalledWith({
      created_by: 'user-1',
      title: '2조 모의면접',
      session_at: '2026-08-20T14:00',
      description: 'Zoom 링크',
    })
  })

  it('redirects with an error when the insert fails', async () => {
    mockInsert({ insertError: { message: 'insert failed' } })
    const formData = buildFormData({ title: '2조 모의면접', sessionAt: '2026-08-20T14:00' })

    await expect(createSession(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith('/interviews?error=' + encodeURIComponent('insert failed'))
  })
})

describe('toggleParticipation', () => {
  function mockFindExisting(existing: { id: string } | null) {
    const deleteEq = vi.fn().mockResolvedValue({ error: null })
    const insert = vi.fn().mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table !== 'interview_participants') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }),
          }),
        }),
        insert,
        delete: () => ({ eq: deleteEq }),
      }
    })

    return { deleteEq, insert }
  }

  it('inserts participation when none exists yet', async () => {
    const { insert, deleteEq } = mockFindExisting(null)

    await toggleParticipation('session-1')

    expect(insert).toHaveBeenCalledWith({ session_id: 'session-1', user_id: 'user-1' })
    expect(deleteEq).not.toHaveBeenCalled()
    expect(revalidatePathMock).toHaveBeenCalledWith('/interviews')
  })

  it('deletes existing participation when the user already joined', async () => {
    const { insert, deleteEq } = mockFindExisting({ id: 'participant-1' })

    await toggleParticipation('session-1')

    expect(deleteEq).toHaveBeenCalledWith('id', 'participant-1')
    expect(insert).not.toHaveBeenCalled()
  })
})

describe('deleteSession', () => {
  function mockOwnerAndRole(createdBy: string, role: 'admin' | 'member') {
    const deleteEq = vi.fn().mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table === 'interview_sessions') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { created_by: createdBy }, error: null }) }) }),
          delete: () => ({ eq: deleteEq }),
        }
      }
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { role }, error: null }) }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    })

    return { deleteEq }
  }

  it('deletes the session when the caller is the creator', async () => {
    const { deleteEq } = mockOwnerAndRole('user-1', 'member')

    await deleteSession('session-1')

    expect(deleteEq).toHaveBeenCalledWith('id', 'session-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/interviews')
  })

  it('deletes the session when the caller is an admin but not the creator', async () => {
    const { deleteEq } = mockOwnerAndRole('user-2', 'admin')

    await deleteSession('session-1')

    expect(deleteEq).toHaveBeenCalledWith('id', 'session-1')
  })

  it('throws when the caller is neither the creator nor an admin', async () => {
    const { deleteEq } = mockOwnerAndRole('user-2', 'member')

    await expect(deleteSession('session-1')).rejects.toThrow('권한이 없습니다')
    expect(deleteEq).not.toHaveBeenCalled()
  })
})
