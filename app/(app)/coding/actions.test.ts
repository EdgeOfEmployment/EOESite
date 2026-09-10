import { describe, it, expect, vi, beforeEach } from 'vitest'

const getClaimsMock = vi.fn()
const insertMock = vi.fn()
const codingWeeksInsertMock = vi.fn()
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

import {
  createProblems,
  deleteProblem,
  updateGithubUsername,
  adminRemoveCheck,
  markSelfComplete,
  unmarkSelfComplete,
} from './actions'

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
    if (table === 'coding_weeks') {
      return { insert: codingWeeksInsertMock }
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
  codingWeeksInsertMock.mockReturnValue({
    select: () => ({ single: async () => ({ data: { id: 'new-week-1' }, error: null }) }),
  })
  mockAdminCheck('admin')
  rpcMock.mockResolvedValue({ error: null })
})

describe('createProblems', () => {
  it('redirects with an error when no problem rows are present', async () => {
    const formData = buildFormData({ weekMode: 'existing', weekId: 'week-1', rowIds: '' })

    await expect(createProblems(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/coding?error=' + encodeURIComponent('문제를 최소 1개 이상 입력해주세요')
    )
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('redirects with an error when adding to an existing week without a weekId', async () => {
    const formData = buildFormData({
      weekMode: 'existing',
      rowIds: 'row-1',
      'title-row-1': '두 수의 합',
      'link-row-1': 'https://example.com/problem/1',
    })

    await expect(createProblems(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith('/coding?error=' + encodeURIComponent('대상 주차를 선택해주세요'))
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('redirects with an error when creating a new week without a label, start date, or end date', async () => {
    const formData = buildFormData({
      weekMode: 'new',
      weekLabel: '',
      weekStartDate: '2026-09-08',
      weekEndDate: '',
      rowIds: 'row-1',
      'title-row-1': '두 수의 합',
      'link-row-1': 'https://example.com/problem/1',
    })

    await expect(createProblems(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/coding?error=' + encodeURIComponent('새 주차의 이름, 시작일, 종료일을 모두 입력해주세요')
    )
    expect(insertMock).not.toHaveBeenCalled()
    expect(codingWeeksInsertMock).not.toHaveBeenCalled()
  })

  it('redirects with an error when a row is missing its title or link', async () => {
    const formData = buildFormData({
      weekMode: 'existing',
      weekId: 'week-1',
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
      weekMode: 'existing',
      weekId: 'week-1',
      rowIds: 'row-1',
      'title-row-1': '두 수의 합',
      'link-row-1': 'https://example.com/problem/1',
    })

    await expect(createProblems(formData)).rejects.toThrow('권한이 없습니다')
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('creates problems against an existing week without touching coding_weeks', async () => {
    const formData = buildFormData({
      weekMode: 'existing',
      weekId: 'week-1',
      rowIds: 'row-1',
      'title-row-1': '두 수의 합',
      'link-row-1': 'https://example.com/problem/1',
      'matchKeyword-row-1': 'two-sum',
      'assigneeIds-row-1': ['user-1', 'user-2'],
    })

    await expect(createProblems(formData)).rejects.toThrow()

    expect(codingWeeksInsertMock).not.toHaveBeenCalled()
    expect(insertMock).toHaveBeenCalledWith([
      {
        title: '두 수의 합',
        link: 'https://example.com/problem/1',
        week_id: 'week-1',
        created_by: 'admin-1',
        match_keyword: 'two-sum',
        assignee_ids: ['user-1', 'user-2'],
      },
    ])
    expect(redirectMock).toHaveBeenCalledWith(
      '/coding?week=week-1&success=' + encodeURIComponent('문제 1개를 등록했어요')
    )
  })

  it('creates a new week, then creates problems against its returned id', async () => {
    const formData = buildFormData({
      weekMode: 'new',
      weekLabel: '1주차',
      weekStartDate: '2026-09-08',
      weekEndDate: '2026-09-14',
      rowIds: 'row-1,row-2',
      'title-row-1': '두 수의 합',
      'link-row-1': 'https://example.com/problem/1',
      'title-row-2': '세 수의 합',
      'link-row-2': 'https://example.com/problem/2',
    })

    await expect(createProblems(formData)).rejects.toThrow()

    expect(codingWeeksInsertMock).toHaveBeenCalledWith({
      label: '1주차',
      start_date: '2026-09-08',
      end_date: '2026-09-14',
      created_by: 'admin-1',
    })
    expect(insertMock).toHaveBeenCalledWith([
      {
        title: '두 수의 합',
        link: 'https://example.com/problem/1',
        week_id: 'new-week-1',
        created_by: 'admin-1',
        match_keyword: null,
        assignee_ids: [],
      },
      {
        title: '세 수의 합',
        link: 'https://example.com/problem/2',
        week_id: 'new-week-1',
        created_by: 'admin-1',
        match_keyword: null,
        assignee_ids: [],
      },
    ])
    expect(redirectMock).toHaveBeenCalledWith(
      '/coding?week=new-week-1&success=' + encodeURIComponent('문제 2개를 등록했어요')
    )
  })

  it('redirects with the error when creating the new week fails', async () => {
    codingWeeksInsertMock.mockReturnValue({
      select: () => ({ single: async () => ({ data: null, error: { message: 'db error' } }) }),
    })
    const formData = buildFormData({
      weekMode: 'new',
      weekLabel: '1주차',
      weekStartDate: '2026-09-08',
      weekEndDate: '2026-09-14',
      rowIds: 'row-1',
      'title-row-1': '두 수의 합',
      'link-row-1': 'https://example.com/problem/1',
    })

    await expect(createProblems(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith('/coding?error=' + encodeURIComponent('db error'))
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('leaves the new week in place (no rollback) when the problem insert fails after it', async () => {
    insertMock.mockResolvedValue({ error: { message: 'problem insert failed' } })
    const formData = buildFormData({
      weekMode: 'new',
      weekLabel: '1주차',
      weekStartDate: '2026-09-08',
      weekEndDate: '2026-09-14',
      rowIds: 'row-1',
      'title-row-1': '두 수의 합',
      'link-row-1': 'https://example.com/problem/1',
    })

    await expect(createProblems(formData)).rejects.toThrow()

    expect(codingWeeksInsertMock).toHaveBeenCalledWith({
      label: '1주차',
      start_date: '2026-09-08',
      end_date: '2026-09-14',
      created_by: 'admin-1',
    })
    expect(insertMock).toHaveBeenCalled()
    expect(redirectMock).toHaveBeenCalledWith(
      '/coding?error=' + encodeURIComponent('problem insert failed')
    )
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

describe('markSelfComplete', () => {
  it('throws when the caller is not authenticated', async () => {
    getClaimsMock.mockResolvedValue({ data: null })

    await expect(markSelfComplete('problem-1')).rejects.toThrow('권한이 없습니다')
  })

  it('throws when the problem is assigned to other members and the caller is not one of them', async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
    const checksInsert = vi.fn()
    fromMock.mockImplementation((table: string) => {
      if (table === 'coding_problems') {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: { assignee_ids: ['user-2'] }, error: null }) }),
          }),
        }
      }
      if (table === 'coding_checks') {
        return { insert: checksInsert }
      }
      throw new Error(`unexpected table ${table}`)
    })

    await expect(markSelfComplete('problem-1')).rejects.toThrow('본인에게 배정된 문제가 아닙니다')
    expect(checksInsert).not.toHaveBeenCalled()
  })

  it('inserts a manual check for the caller when the problem has no assignees', async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
    const checksInsert = vi.fn().mockResolvedValue({ error: null })
    fromMock.mockImplementation((table: string) => {
      if (table === 'coding_problems') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { assignee_ids: [] }, error: null }) }) }),
        }
      }
      if (table === 'coding_checks') {
        return { insert: checksInsert }
      }
      throw new Error(`unexpected table ${table}`)
    })

    await markSelfComplete('problem-1')

    expect(checksInsert).toHaveBeenCalledWith({
      problem_id: 'problem-1',
      user_id: 'user-1',
      source: 'manual',
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/coding')
  })

  it('inserts a manual check when the caller is one of the assigned members', async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
    const checksInsert = vi.fn().mockResolvedValue({ error: null })
    fromMock.mockImplementation((table: string) => {
      if (table === 'coding_problems') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { assignee_ids: ['user-1', 'user-2'] }, error: null }),
            }),
          }),
        }
      }
      if (table === 'coding_checks') {
        return { insert: checksInsert }
      }
      throw new Error(`unexpected table ${table}`)
    })

    await markSelfComplete('problem-1')

    expect(checksInsert).toHaveBeenCalledWith({
      problem_id: 'problem-1',
      user_id: 'user-1',
      source: 'manual',
    })
  })

  it('ignores a unique-constraint violation (already checked) without throwing', async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
    const checksInsert = vi.fn().mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } })
    fromMock.mockImplementation((table: string) => {
      if (table === 'coding_problems') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { assignee_ids: [] }, error: null }) }) }),
        }
      }
      if (table === 'coding_checks') {
        return { insert: checksInsert }
      }
      throw new Error(`unexpected table ${table}`)
    })

    await expect(markSelfComplete('problem-1')).resolves.toBeUndefined()
    expect(revalidatePathMock).toHaveBeenCalledWith('/coding')
  })

  it('throws the Supabase error message for a non-conflict insert failure', async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
    const checksInsert = vi.fn().mockResolvedValue({ error: { code: '42501', message: 'permission denied' } })
    fromMock.mockImplementation((table: string) => {
      if (table === 'coding_problems') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { assignee_ids: [] }, error: null }) }) }),
        }
      }
      if (table === 'coding_checks') {
        return { insert: checksInsert }
      }
      throw new Error(`unexpected table ${table}`)
    })

    await expect(markSelfComplete('problem-1')).rejects.toThrow('permission denied')
  })
})

describe('unmarkSelfComplete', () => {
  it('throws when the caller is not authenticated', async () => {
    getClaimsMock.mockResolvedValue({ data: null })

    await expect(unmarkSelfComplete('problem-1')).rejects.toThrow('권한이 없습니다')
  })

  it("deletes the caller's own manual check and revalidates /coding", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
    const thirdEq = vi.fn().mockResolvedValue({ error: null })
    const secondEq = vi.fn(() => ({ eq: thirdEq }))
    const firstEq = vi.fn(() => ({ eq: secondEq }))
    fromMock.mockImplementation((table: string) => {
      if (table === 'coding_checks') {
        return { delete: () => ({ eq: firstEq }) }
      }
      throw new Error(`unexpected table ${table}`)
    })

    await unmarkSelfComplete('problem-1')

    expect(firstEq).toHaveBeenCalledWith('problem_id', 'problem-1')
    expect(secondEq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(thirdEq).toHaveBeenCalledWith('source', 'manual')
    expect(revalidatePathMock).toHaveBeenCalledWith('/coding')
  })

  it('throws the Supabase error message on delete failure', async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
    const thirdEq = vi.fn().mockResolvedValue({ error: { message: 'db error' } })
    const secondEq = vi.fn(() => ({ eq: thirdEq }))
    const firstEq = vi.fn(() => ({ eq: secondEq }))
    fromMock.mockImplementation((table: string) => {
      if (table === 'coding_checks') {
        return { delete: () => ({ eq: firstEq }) }
      }
      throw new Error(`unexpected table ${table}`)
    })

    await expect(unmarkSelfComplete('problem-1')).rejects.toThrow('db error')
  })
})
