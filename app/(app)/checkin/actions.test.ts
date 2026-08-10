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

import { createCheckinPost } from './actions'

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

    await createCheckinPost(formData)

    expect(uploadMock).not.toHaveBeenCalled()
    expect(insertMock).toHaveBeenCalledWith({
      author_id: 'user-1',
      type: 'wake',
      body: '오늘의 인증',
      photo_url: null,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/checkin')
    expect(revalidatePathMock).toHaveBeenCalledWith('/')
  })

  it('uploads the photo and stores its public URL when provided', async () => {
    const photo = new File(['fake-image-bytes'], 'photo.jpg', { type: 'image/jpeg' })
    const formData = buildFormData({ type: 'wake', body: '오늘의 인증', photo })

    await createCheckinPost(formData)

    expect(uploadMock).toHaveBeenCalled()
    expect(insertMock).toHaveBeenCalledWith({
      author_id: 'user-1',
      type: 'wake',
      body: '오늘의 인증',
      photo_url: 'https://example.com/photo.jpg',
    })
  })
})
