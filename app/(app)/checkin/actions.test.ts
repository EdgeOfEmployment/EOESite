import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getUserMock = vi.fn()
const uploadMock = vi.fn()
const getPublicUrlMock = vi.fn()
const insertMock = vi.fn()
const fromMock = vi.fn()
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})
const revalidatePathMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    storage: { from: () => ({ upload: uploadMock, getPublicUrl: getPublicUrlMock }) },
    from: fromMock,
  })),
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}))

import {
  createCheckinPost,
  addComment,
  toggleReaction,
  toggleGoalCompleted,
  updateCheckinGoals,
  deleteCheckinPost,
} from './actions'

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
  uploadMock.mockResolvedValue({ error: null })
  getPublicUrlMock.mockReturnValue({ data: { publicUrl: 'https://example.com/photo.jpg' } })
  insertMock.mockResolvedValue({ error: null })
  fromMock.mockReturnValue({ insert: insertMock })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createCheckinPost', () => {
  it('redirects with an error when no photo is provided', async () => {
    const formData = buildFormData({ goalCount: '0' })

    await expect(createCheckinPost(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith('/checkin?error=' + encodeURIComponent('책상 인증 사진을 첨부해주세요'))
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('creates a post with no goals when goalCount is 0', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-10T00:00:00.000Z'))
    const photo = new File(['fake-image-bytes'], 'photo.jpg', { type: 'image/jpeg' })
    const formData = buildFormData({ photo, goalCount: '0' })

    await expect(createCheckinPost(formData)).rejects.toThrow()

    expect(insertMock).toHaveBeenCalledWith({
      author_id: 'user-1',
      photo_url: 'https://example.com/photo.jpg',
      goals: [],
      is_late: false,
      fine_amount: 0,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/checkin')
    expect(revalidatePathMock).toHaveBeenCalledWith('/')
    expect(redirectMock).toHaveBeenCalledWith('/checkin?success=' + encodeURIComponent('인증을 등록했어요'))
  })

  it('inserts non-empty goals as unfinished and skips blank ones, and computes the late fine', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-10T01:05:00.000Z')) // 10:05 KST -> late, +1000
    const photo = new File(['fake-image-bytes'], 'photo.jpg', { type: 'image/jpeg' })
    const formData = buildFormData({
      photo,
      goalCount: '2',
      'goal-0': '알고리즘 3문제 풀기',
      'goal-1': '   ',
    })

    await expect(createCheckinPost(formData)).rejects.toThrow()

    expect(insertMock).toHaveBeenCalledWith({
      author_id: 'user-1',
      photo_url: 'https://example.com/photo.jpg',
      goals: [{ body: '알고리즘 3문제 풀기', completed: false, completedAt: null }],
      is_late: true,
      fine_amount: 11000,
    })
  })
})

describe('addComment', () => {
  it('redirects with an error when the comment body is empty', async () => {
    const formData = new FormData()
    formData.set('body', '')

    await expect(addComment('post-1', formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith('/checkin?error=' + encodeURIComponent('댓글 내용을 입력해주세요'))
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('inserts the comment and revalidates the checkin feed', async () => {
    const formData = new FormData()
    formData.set('body', '축하해요')

    await addComment('post-1', formData)

    expect(insertMock).toHaveBeenCalledWith({ post_id: 'post-1', author_id: 'user-1', body: '축하해요' })
    expect(revalidatePathMock).toHaveBeenCalledWith('/checkin')
  })
})

describe('toggleReaction', () => {
  function mockFindExisting(existing: { id: string } | null) {
    const deleteEq = vi.fn().mockResolvedValue({ error: null })
    const insert = vi.fn().mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table !== 'checkin_reactions') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }),
            }),
          }),
        }),
        insert,
        delete: () => ({ eq: deleteEq }),
      }
    })

    return { deleteEq, insert }
  }

  it('inserts a reaction when none exists yet', async () => {
    const { insert, deleteEq } = mockFindExisting(null)

    await toggleReaction('post-1', '👍')

    expect(insert).toHaveBeenCalledWith({ post_id: 'post-1', author_id: 'user-1', emoji: '👍' })
    expect(deleteEq).not.toHaveBeenCalled()
    expect(revalidatePathMock).toHaveBeenCalledWith('/checkin')
  })

  it('deletes the existing reaction when the user already reacted', async () => {
    const { insert, deleteEq } = mockFindExisting({ id: 'reaction-1' })

    await toggleReaction('post-1', '👍')

    expect(deleteEq).toHaveBeenCalledWith('id', 'reaction-1')
    expect(insert).not.toHaveBeenCalled()
  })
})

describe('toggleGoalCompleted', () => {
  function mockPost(
    goals: { body: string; completed: boolean; completedAt: string | null }[],
    authorId = 'user-1'
  ) {
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn(() => ({ eq: updateEq }))

    fromMock.mockImplementation((table: string) => {
      if (table !== 'checkin_posts') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: { author_id: authorId, goals }, error: null }) }),
        }),
        update,
      }
    })

    return { update, updateEq }
  }

  it('marks the goal completed and stamps completedAt', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-10T02:00:00.000Z'))
    const { update, updateEq } = mockPost([{ body: '알고리즘 3문제 풀기', completed: false, completedAt: null }])

    await toggleGoalCompleted('post-1', 0)

    expect(update).toHaveBeenCalledWith({
      goals: [{ body: '알고리즘 3문제 풀기', completed: true, completedAt: '2026-08-10T02:00:00.000Z' }],
    })
    expect(updateEq).toHaveBeenCalledWith('id', 'post-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/checkin')
  })

  it('unchecks a completed goal and clears completedAt', async () => {
    const { update } = mockPost([
      { body: '알고리즘 3문제 풀기', completed: true, completedAt: '2026-08-10T02:00:00.000Z' },
    ])

    await toggleGoalCompleted('post-1', 0)

    expect(update).toHaveBeenCalledWith({
      goals: [{ body: '알고리즘 3문제 풀기', completed: false, completedAt: null }],
    })
  })

  it('throws when the caller is not the post author', async () => {
    mockPost([{ body: '알고리즘 3문제 풀기', completed: false, completedAt: null }], 'other-user')

    await expect(toggleGoalCompleted('post-1', 0)).rejects.toThrow('권한이 없습니다')
  })
})

describe('updateCheckinGoals', () => {
  function mockPost(authorId = 'user-1') {
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn(() => ({ eq: updateEq }))

    fromMock.mockImplementation((table: string) => {
      if (table !== 'checkin_posts') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: { author_id: authorId }, error: null }) }),
        }),
        update,
      }
    })

    return { update, updateEq }
  }

  function buildGoalsFormData(
    goals: { body: string; completed?: boolean; completedAt?: string | null }[]
  ) {
    const formData = new FormData()
    formData.set('goalCount', String(goals.length))
    goals.forEach((g, i) => {
      formData.set(`goal-${i}`, g.body)
      formData.set(`completed-${i}`, g.completed ? 'true' : 'false')
      formData.set(`completedAt-${i}`, g.completedAt ?? '')
    })
    return formData
  }

  it('updates the goals for the post author', async () => {
    const { update, updateEq } = mockPost()
    const formData = buildGoalsFormData([
      { body: '알고리즘 3문제 풀기', completed: false, completedAt: null },
      { body: '이력서 초안 작성', completed: true, completedAt: '2026-08-10T02:00:00.000Z' },
    ])

    await updateCheckinGoals('post-1', formData)

    expect(update).toHaveBeenCalledWith({
      goals: [
        { body: '알고리즘 3문제 풀기', completed: false, completedAt: null },
        { body: '이력서 초안 작성', completed: true, completedAt: '2026-08-10T02:00:00.000Z' },
      ],
    })
    expect(updateEq).toHaveBeenCalledWith('id', 'post-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/checkin')
  })

  it('skips blank goal text', async () => {
    const { update } = mockPost()
    const formData = buildGoalsFormData([{ body: '알고리즘 3문제 풀기' }, { body: '   ' }])

    await updateCheckinGoals('post-1', formData)

    expect(update).toHaveBeenCalledWith({
      goals: [{ body: '알고리즘 3문제 풀기', completed: false, completedAt: null }],
    })
  })

  it('throws when the caller is not the post author', async () => {
    mockPost('other-user')
    const formData = buildGoalsFormData([{ body: '알고리즘 3문제 풀기' }])

    await expect(updateCheckinGoals('post-1', formData)).rejects.toThrow('권한이 없습니다')
  })
})

describe('deleteCheckinPost', () => {
  function mockAdminCheck(role: 'admin' | 'member') {
    const deleteEq = vi.fn().mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { role }, error: null }) }) }) }
      }
      if (table === 'checkin_posts') {
        return { delete: () => ({ eq: deleteEq }) }
      }
      throw new Error(`unexpected table ${table}`)
    })

    return { deleteEq }
  }

  it('deletes the post when the caller is an admin', async () => {
    const { deleteEq } = mockAdminCheck('admin')

    await deleteCheckinPost('post-1')

    expect(deleteEq).toHaveBeenCalledWith('id', 'post-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/checkin')
  })

  it('throws when the caller is not an admin', async () => {
    const { deleteEq } = mockAdminCheck('member')

    await expect(deleteCheckinPost('post-1')).rejects.toThrow('권한이 없습니다')
    expect(deleteEq).not.toHaveBeenCalled()
  })
})
