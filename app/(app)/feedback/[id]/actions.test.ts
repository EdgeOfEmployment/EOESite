import { describe, it, expect, vi, beforeEach } from 'vitest'

const getClaimsMock = vi.fn()
const insertMock = vi.fn()
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

import { addFeedbackComment } from './actions'

beforeEach(() => {
  vi.clearAllMocks()
  redirectMock.mockImplementation((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  })
  getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
  insertMock.mockResolvedValue({ error: null })
  fromMock.mockReturnValue({ insert: insertMock })
})

describe('addFeedbackComment', () => {
  it('redirects with an error when the comment body is empty', async () => {
    const formData = new FormData()
    formData.set('body', '')

    await expect(addFeedbackComment('doc-1', 0, null, formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/feedback/doc-1?error=' + encodeURIComponent('댓글 내용을 입력해주세요')
    )
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('inserts a top-level comment with no parent', async () => {
    const formData = new FormData()
    formData.set('body', '이 문장을 더 구체적으로 써보세요')

    await addFeedbackComment('doc-1', 2, null, formData)

    expect(insertMock).toHaveBeenCalledWith({
      feedback_doc_id: 'doc-1',
      line_index: 2,
      parent_comment_id: null,
      author_id: 'user-1',
      body: '이 문장을 더 구체적으로 써보세요',
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/feedback/doc-1')
  })

  it('inserts a reply with the given parent comment id', async () => {
    const formData = new FormData()
    formData.set('body', '반영했습니다')

    await addFeedbackComment('doc-1', 2, 'comment-1', formData)

    expect(insertMock).toHaveBeenCalledWith({
      feedback_doc_id: 'doc-1',
      line_index: 2,
      parent_comment_id: 'comment-1',
      author_id: 'user-1',
      body: '반영했습니다',
    })
  })
})
