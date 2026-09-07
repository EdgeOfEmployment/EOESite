import { describe, it, expect, vi, beforeEach } from 'vitest'

const getClaimsMock = vi.fn()
const fromMock = vi.fn()
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})
const revalidatePathMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: getClaimsMock },
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
  getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
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
    const formData = buildFormData({
      companyName: '',
      questionCount: '1',
      'question-0': '지원동기',
      'answer-0': '내용',
    })

    await expect(createJobPost(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/jobposts?error=' + encodeURIComponent('회사명과 최소 한 개의 문항/답변을 입력해주세요')
    )
  })

  it('redirects with an error when no question/answer pair is valid', async () => {
    const formData = buildFormData({
      companyName: '토스',
      questionCount: '1',
      'question-0': '',
      'answer-0': '',
    })

    await expect(createJobPost(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/jobposts?error=' + encodeURIComponent('회사명과 최소 한 개의 문항/답변을 입력해주세요')
    )
  })

  it('drops a pair where only the question or only the answer is filled in', async () => {
    const { jobPostsInsert } = mockInsert()
    const formData = buildFormData({
      companyName: '토스',
      postDate: '2026-08-13',
      questionCount: '2',
      'question-0': '지원동기',
      'answer-0': '',
      'question-1': '강점',
      'answer-1': '문제 해결 능력.',
    })

    await expect(createJobPost(formData)).rejects.toThrow()

    expect(jobPostsInsert).toHaveBeenCalledWith({
      author_id: 'user-1',
      post_date: '2026-08-13',
      company_name: '토스',
      posting_info: null,
      questions: [{ question: '강점', answer: '문제 해결 능력.' }],
      feedback_requested: false,
    })
    expect(redirectMock).toHaveBeenCalledWith('/jobposts?success=' + encodeURIComponent('자소서를 등록했어요'))
  })

  it('creates a job post with multiple question/answer pairs', async () => {
    const { jobPostsInsert, feedbackDocsInsert } = mockInsert()
    const formData = buildFormData({
      companyName: '토스',
      postDate: '2026-08-13',
      questionCount: '2',
      'question-0': '지원동기',
      'answer-0': '첫 문장.',
      'question-1': '강점',
      'answer-1': '둘째 문장.',
    })

    await expect(createJobPost(formData)).rejects.toThrow()

    expect(jobPostsInsert).toHaveBeenCalledWith({
      author_id: 'user-1',
      post_date: '2026-08-13',
      company_name: '토스',
      posting_info: null,
      questions: [
        { question: '지원동기', answer: '첫 문장.' },
        { question: '강점', answer: '둘째 문장.' },
      ],
      feedback_requested: false,
    })
    expect(feedbackDocsInsert).not.toHaveBeenCalled()
    expect(redirectMock).toHaveBeenCalledWith('/jobposts?success=' + encodeURIComponent('자소서를 등록했어요'))
  })

  it('creates a feedback snapshot split into per-question lines when feedback is requested', async () => {
    const { feedbackDocsInsert } = mockInsert()
    const formData = buildFormData({
      companyName: '토스',
      postDate: '2026-08-13',
      questionCount: '1',
      'question-0': '지원동기',
      'answer-0': '첫 문장. 둘째 문장.',
      feedbackRequested: 'on',
    })

    await expect(createJobPost(formData)).rejects.toThrow()

    expect(feedbackDocsInsert).toHaveBeenCalledWith({
      job_post_id: 'post-1',
      lines: [
        { questionIndex: 0, question: '지원동기', text: '첫 문장.' },
        { questionIndex: 0, question: '지원동기', text: '둘째 문장.' },
      ],
    })
    expect(redirectMock).toHaveBeenCalledWith('/jobposts?success=' + encodeURIComponent('자소서를 등록했어요'))
  })

  it('redirects with an error when the job post insert fails', async () => {
    mockInsert({ jobPostError: { message: 'insert failed' } })
    const formData = buildFormData({
      companyName: '토스',
      questionCount: '1',
      'question-0': '지원동기',
      'answer-0': '내용',
    })

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
