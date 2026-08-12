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

import { createJobPost, toggleReaction, deleteJobPost } from './actions'

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

describe('createJobPost', () => {
  function mockInsert({ jobPostError = null }: { jobPostError?: { message: string } | null } = {}) {
    const feedbackDocsInsert = vi.fn().mockResolvedValue({ error: null })
    const jobPostsSingle = vi
      .fn()
      .mockResolvedValue(
        jobPostError ? { data: null, error: jobPostError } : { data: { id: 'post-1' }, error: null }
      )
    const jobPostsInsert = vi.fn().mockReturnValue({ select: () => ({ single: jobPostsSingle }) })

    fromMock.mockImplementation((table: string) => {
      if (table === 'job_posts') return { insert: jobPostsInsert }
      if (table === 'feedback_docs') return { insert: feedbackDocsInsert }
      throw new Error(`unexpected table ${table}`)
    })

    return { jobPostsInsert, feedbackDocsInsert }
  }

  it('redirects with an error when the company name is missing', async () => {
    const formData = buildFormData({ companyName: '', coverLetterText: '내용' })

    await expect(createJobPost(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/jobposts?error=' + encodeURIComponent('회사명과 자소서 내용을 입력해주세요')
    )
  })

  it('redirects with an error when the cover letter text is missing', async () => {
    const formData = buildFormData({ companyName: '토스', coverLetterText: '' })

    await expect(createJobPost(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/jobposts?error=' + encodeURIComponent('회사명과 자소서 내용을 입력해주세요')
    )
  })

  it('creates a job post without a feedback snapshot when feedback is not requested', async () => {
    const { jobPostsInsert, feedbackDocsInsert } = mockInsert()
    const formData = buildFormData({
      companyName: '토스',
      coverLetterText: '자기소개서 내용',
      postDate: '2026-08-12',
    })

    await createJobPost(formData)

    expect(jobPostsInsert).toHaveBeenCalledWith({
      author_id: 'user-1',
      post_date: '2026-08-12',
      company_name: '토스',
      posting_info: null,
      cover_letter_text: '자기소개서 내용',
      feedback_requested: false,
    })
    expect(feedbackDocsInsert).not.toHaveBeenCalled()
    expect(revalidatePathMock).toHaveBeenCalledWith('/jobposts')
  })

  it('creates a feedback snapshot split into lines when feedback is requested', async () => {
    const { feedbackDocsInsert } = mockInsert()
    const formData = buildFormData({
      companyName: '토스',
      coverLetterText: '첫 줄\n둘째 줄',
      postDate: '2026-08-12',
      feedbackRequested: 'on',
    })

    await createJobPost(formData)

    expect(feedbackDocsInsert).toHaveBeenCalledWith({
      job_post_id: 'post-1',
      lines: ['첫 줄', '둘째 줄'],
    })
  })

  it('redirects with an error when the job post insert fails', async () => {
    mockInsert({ jobPostError: { message: 'insert failed' } })
    const formData = buildFormData({ companyName: '토스', coverLetterText: '내용' })

    await expect(createJobPost(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith('/jobposts?error=' + encodeURIComponent('insert failed'))
  })
})

describe('toggleReaction', () => {
  function mockFindExisting(existing: { id: string } | null) {
    const deleteEq = vi.fn().mockResolvedValue({ error: null })
    const insert = vi.fn().mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table !== 'job_post_reactions') throw new Error(`unexpected table ${table}`)
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
    expect(revalidatePathMock).toHaveBeenCalledWith('/jobposts')
  })

  it('deletes the existing reaction when the user already reacted', async () => {
    const { insert, deleteEq } = mockFindExisting({ id: 'reaction-1' })

    await toggleReaction('post-1', '👍')

    expect(deleteEq).toHaveBeenCalledWith('id', 'reaction-1')
    expect(insert).not.toHaveBeenCalled()
  })
})

describe('deleteJobPost', () => {
  function mockAdminCheck(role: 'admin' | 'member') {
    const deleteEq = vi.fn().mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { role }, error: null }) }) }) }
      }
      if (table === 'job_posts') {
        return { delete: () => ({ eq: deleteEq }) }
      }
      throw new Error(`unexpected table ${table}`)
    })

    return { deleteEq }
  }

  it('deletes the post when the caller is an admin', async () => {
    const { deleteEq } = mockAdminCheck('admin')

    await deleteJobPost('post-1')

    expect(deleteEq).toHaveBeenCalledWith('id', 'post-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/jobposts')
  })

  it('throws when the caller is not an admin', async () => {
    const { deleteEq } = mockAdminCheck('member')

    await expect(deleteJobPost('post-1')).rejects.toThrow('권한이 없습니다')
    expect(deleteEq).not.toHaveBeenCalled()
  })
})
