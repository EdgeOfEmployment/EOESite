import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUserMock = vi.fn()
const insertMock = vi.fn()
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

import { createProblem } from './actions'

function buildFormData(fields: Record<string, string>) {
  const formData = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value)
  }
  return formData
}

function mockAdminCheck(role: 'admin' | 'member') {
  fromMock.mockImplementation((table: string) => {
    if (table === 'profiles') {
      return { select: () => ({ eq: () => ({ single: async () => ({ data: { role }, error: null }) }) }) }
    }
    if (table === 'coding_problems') {
      return { insert: insertMock }
    }
    throw new Error(`unexpected table ${table}`)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  redirectMock.mockImplementation((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  })
  getUserMock.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  insertMock.mockResolvedValue({ error: null })
  mockAdminCheck('admin')
})

describe('createProblem', () => {
  it('redirects with an error when a required field is missing', async () => {
    const formData = buildFormData({ title: '두 수의 합', link: '', weekOf: '2026-08-11' })

    await expect(createProblem(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/coding?error=' + encodeURIComponent('문제명, 링크, 주차를 모두 입력해주세요')
    )
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('throws when the caller is not an admin', async () => {
    mockAdminCheck('member')
    const formData = buildFormData({
      title: '두 수의 합',
      link: 'https://example.com/problem/1',
      weekOf: '2026-08-11',
    })

    await expect(createProblem(formData)).rejects.toThrow('권한이 없습니다')
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('creates the problem and revalidates /coding', async () => {
    const formData = buildFormData({
      title: '두 수의 합',
      link: 'https://example.com/problem/1',
      weekOf: '2026-08-11',
    })

    await createProblem(formData)

    expect(insertMock).toHaveBeenCalledWith({
      title: '두 수의 합',
      link: 'https://example.com/problem/1',
      week_of: '2026-08-11',
      created_by: 'admin-1',
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/coding')
  })
})
