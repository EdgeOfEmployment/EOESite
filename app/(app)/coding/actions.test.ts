import { describe, it, expect, vi, beforeEach } from 'vitest'

const getClaimsMock = vi.fn()
const insertMock = vi.fn()
const fromMock = vi.fn()
const rpcMock = vi.fn()
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})
const revalidatePathMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: getClaimsMock },
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

import { createProblems, deleteProblem, updateGithubUsername, adminRemoveCheck } from './actions'

function buildFormData(fields: Record<string, string | string[]>) {
  const formData = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      for (const v of value) formData.append(key, v)
    } else {
      formData.set(key, value)
    }
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
  getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'admin-1' } } })
  insertMock.mockResolvedValue({ error: null })
  mockAdminCheck('admin')
  rpcMock.mockResolvedValue({ error: null })
})

describe('createProblems', () => {
  it('redirects with an error when the week is missing', async () => {
    const formData = buildFormData({
      weekOf: '',
      rowIds: 'row-1',
      'title-row-1': '두 수의 합',
      'link-row-1': 'https://example.com/problem/1',
    })

    await expect(createProblems(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/coding?error=' + encodeURIComponent('대상 주차와 문제를 최소 1개 이상 입력해주세요')
    )
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('redirects with an error when no problem rows are present', async () => {
    const formData = buildFormData({ weekOf: '2026-08-11', rowIds: '' })

    await expect(createProblems(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/coding?error=' + encodeURIComponent('대상 주차와 문제를 최소 1개 이상 입력해주세요')
    )
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('redirects with an error when a row is missing its title or link', async () => {
    const formData = buildFormData({
      weekOf: '2026-08-11',
      rowIds: 'row-1',
      'title-row-1': '두 수의 합',
      'link-row-1': '',
    })

    await expect(createProblems(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/coding?error=' + encodeURIComponent('모든 문제에 문제명과 링크를 입력해주세요')
    )
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('throws when the caller is not an admin', async () => {
    mockAdminCheck('member')
    const formData = buildFormData({
      weekOf: '2026-08-11',
      rowIds: 'row-1',
      'title-row-1': '두 수의 합',
      'link-row-1': 'https://example.com/problem/1',
    })

    await expect(createProblems(formData)).rejects.toThrow('권한이 없습니다')
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('creates a single problem with a null keyword and empty assignee list when none are given', async () => {
    const formData = buildFormData({
      weekOf: '2026-08-11',
      rowIds: 'row-1',
      'title-row-1': '두 수의 합',
      'link-row-1': 'https://example.com/problem/1',
    })

    await expect(createProblems(formData)).rejects.toThrow()

    expect(insertMock).toHaveBeenCalledWith([
      {
        title: '두 수의 합',
        link: 'https://example.com/problem/1',
        week_of: '2026-08-11',
        created_by: 'admin-1',
        match_keyword: null,
        assignee_ids: [],
      },
    ])
    expect(redirectMock).toHaveBeenCalledWith('/coding?success=' + encodeURIComponent('문제 1개를 등록했어요'))
  })

  it('creates multiple problems in one submission, each with its own keyword and assignees', async () => {
    const formData = buildFormData({
      weekOf: '2026-08-11',
      rowIds: 'row-1,row-2',
      'title-row-1': '두 수의 합',
      'link-row-1': 'https://example.com/problem/1',
      'matchKeyword-row-1': 'two-sum',
      'assigneeIds-row-1': ['user-1', 'user-2'],
      'title-row-2': '세 수의 합',
      'link-row-2': 'https://example.com/problem/2',
    })

    await expect(createProblems(formData)).rejects.toThrow()

    expect(insertMock).toHaveBeenCalledWith([
      {
        title: '두 수의 합',
        link: 'https://example.com/problem/1',
        week_of: '2026-08-11',
        created_by: 'admin-1',
        match_keyword: 'two-sum',
        assignee_ids: ['user-1', 'user-2'],
      },
      {
        title: '세 수의 합',
        link: 'https://example.com/problem/2',
        week_of: '2026-08-11',
        created_by: 'admin-1',
        match_keyword: null,
        assignee_ids: [],
      },
    ])
    expect(redirectMock).toHaveBeenCalledWith('/coding?success=' + encodeURIComponent('문제 2개를 등록했어요'))
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

    await expect(updateGithubUsername(formData)).rejects.toThrow()

    expect(rpcMock).toHaveBeenCalledWith('update_own_github_username', {
      new_username: 'kimminsu-dev',
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/coding')
    expect(redirectMock).toHaveBeenCalledWith(
      '/coding?success=' + encodeURIComponent('GitHub 아이디를 저장했어요')
    )
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
