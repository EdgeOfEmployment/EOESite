import { describe, it, expect, vi, beforeEach } from 'vitest'

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

import { createCheckinPost, addComment, toggleReaction, deleteCheckinPost } from './actions'

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

describe('createCheckinPost', () => {
  it('redirects with an error when the body is missing', async () => {
    const formData = buildFormData({ type: 'wake', body: '' })

    await expect(createCheckinPost(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/checkin?error=' + encodeURIComponent('인증 종류와 내용을 입력해주세요')
    )
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid checkin type', async () => {
    const formData = buildFormData({ type: 'invalid', body: '오늘의 인증' })

    await expect(createCheckinPost(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/checkin?error=' + encodeURIComponent('인증 종류와 내용을 입력해주세요')
    )
  })

  it('creates a post without a photo when none is provided', async () => {
    const formData = buildFormData({ type: 'wake', body: '오늘의 인증' })

    await expect(createCheckinPost(formData)).rejects.toThrow()

    expect(uploadMock).not.toHaveBeenCalled()
    expect(insertMock).toHaveBeenCalledWith({
      author_id: 'user-1',
      type: 'wake',
      body: '오늘의 인증',
      photo_url: null,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/checkin')
    expect(revalidatePathMock).toHaveBeenCalledWith('/')
    expect(redirectMock).toHaveBeenCalledWith('/checkin?success=' + encodeURIComponent('인증을 등록했어요'))
  })

  it('uploads the photo and stores its public URL when provided', async () => {
    const photo = new File(['fake-image-bytes'], 'photo.jpg', { type: 'image/jpeg' })
    const formData = buildFormData({ type: 'wake', body: '오늘의 인증', photo })

    await expect(createCheckinPost(formData)).rejects.toThrow()

    expect(uploadMock).toHaveBeenCalled()
    expect(insertMock).toHaveBeenCalledWith({
      author_id: 'user-1',
      type: 'wake',
      body: '오늘의 인증',
      photo_url: 'https://example.com/photo.jpg',
    })
    expect(redirectMock).toHaveBeenCalledWith('/checkin?success=' + encodeURIComponent('인증을 등록했어요'))
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
