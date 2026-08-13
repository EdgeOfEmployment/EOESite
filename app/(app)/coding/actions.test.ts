import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUserMock = vi.fn()
const insertMock = vi.fn()
const fromMock = vi.fn()
const rpcMock = vi.fn()
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})
const revalidatePathMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  })),
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}))

import { createProblem, deleteProblem, updateGithubUsername, adminRemoveCheck } from './actions'

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
  rpcMock.mockResolvedValue({ error: null })
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

  it('creates the problem with a null match keyword when none is provided', async () => {
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
      match_keyword: null,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/coding')
  })

  it('passes the optional match keyword when provided', async () => {
    const formData = buildFormData({
      title: '두 수의 합',
      link: 'https://example.com/problem/1',
      weekOf: '2026-08-11',
      matchKeyword: 'two-sum',
    })

    await createProblem(formData)

    expect(insertMock).toHaveBeenCalledWith({
      title: '두 수의 합',
      link: 'https://example.com/problem/1',
      week_of: '2026-08-11',
      created_by: 'admin-1',
      match_keyword: 'two-sum',
    })
  })
})

describe('deleteProblem', () => {
  it('deletes the problem when the caller is an admin', async () => {
    const deleteEq = vi.fn().mockResolvedValue({ error: null })
    mockAdminCheck('admin')
    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'admin' }, error: null }) }) }) }
      }
      if (table === 'coding_problems') {
        return { delete: () => ({ eq: deleteEq }) }
      }
      throw new Error(`unexpected table ${table}`)
    })

    await deleteProblem('problem-1')

    expect(deleteEq).toHaveBeenCalledWith('id', 'problem-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/coding')
  })

  it('throws when the caller is not an admin', async () => {
    const deleteEq = vi.fn()
    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'member' }, error: null }) }) }) }
      }
      if (table === 'coding_problems') {
        return { delete: () => ({ eq: deleteEq }) }
      }
      throw new Error(`unexpected table ${table}`)
    })

    await expect(deleteProblem('problem-1')).rejects.toThrow('권한이 없습니다')
    expect(deleteEq).not.toHaveBeenCalled()
  })
})

describe('updateGithubUsername', () => {
  it('redirects with an error when the username is empty', async () => {
    const formData = buildFormData({ githubUsername: '' })

    await expect(updateGithubUsername(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/coding?error=' + encodeURIComponent('GitHub 아이디를 입력해주세요')
    )
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('calls the update_own_github_username RPC and revalidates /coding', async () => {
    const formData = buildFormData({ githubUsername: 'kimminsu-dev' })

    await updateGithubUsername(formData)

    expect(rpcMock).toHaveBeenCalledWith('update_own_github_username', {
      new_username: 'kimminsu-dev',
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/coding')
  })

  it('redirects with the Supabase error message when the RPC fails', async () => {
    rpcMock.mockResolvedValue({ error: { message: 'db error' } })
    const formData = buildFormData({ githubUsername: 'kimminsu-dev' })

    await expect(updateGithubUsername(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith('/coding?error=' + encodeURIComponent('db error'))
  })
})

describe('adminRemoveCheck', () => {
  it('throws when the caller is not an admin', async () => {
    const secondEq = vi.fn()
    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'member' }, error: null }) }) }),
        }
      }
      if (table === 'coding_checks') {
        return { delete: () => ({ eq: () => ({ eq: secondEq }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    })

    await expect(adminRemoveCheck('problem-1', 'user-2')).rejects.toThrow('권한이 없습니다')
    expect(secondEq).not.toHaveBeenCalled()
  })

  it('deletes the matching check when the caller is an admin', async () => {
    const secondEq = vi.fn().mockResolvedValue({ error: null })
    const firstEq = vi.fn(() => ({ eq: secondEq }))
    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'admin' }, error: null }) }) }),
        }
      }
      if (table === 'coding_checks') {
        return { delete: () => ({ eq: firstEq }) }
      }
      throw new Error(`unexpected table ${table}`)
    })

    await adminRemoveCheck('problem-1', 'user-2')

    expect(firstEq).toHaveBeenCalledWith('problem_id', 'problem-1')
    expect(secondEq).toHaveBeenCalledWith('user_id', 'user-2')
    expect(revalidatePathMock).toHaveBeenCalledWith('/coding')
  })
})
