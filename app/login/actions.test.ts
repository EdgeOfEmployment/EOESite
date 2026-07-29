import { describe, it, expect, vi, beforeEach } from 'vitest'

const signInWithPasswordMock = vi.fn()
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { signInWithPassword: signInWithPasswordMock } })),
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))

import { logIn } from './actions'

function buildFormData(fields: Record<string, string>) {
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
  signInWithPasswordMock.mockResolvedValue({ error: null })
})

describe('logIn', () => {
  it('redirects with an error when a required field is missing', async () => {
    const formData = buildFormData({ email: 'test@example.com' })

    await expect(logIn(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/login?error=' + encodeURIComponent('이메일과 비밀번호를 입력해주세요')
    )
    expect(signInWithPasswordMock).not.toHaveBeenCalled()
  })

  it('redirects with the Supabase error message when signInWithPassword fails', async () => {
    signInWithPasswordMock.mockResolvedValue({
      error: { message: '이메일 또는 비밀번호가 올바르지 않습니다' },
    })
    const formData = buildFormData({
      email: 'test@example.com',
      password: '123456',
    })

    await expect(logIn(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/login?error=' + encodeURIComponent('이메일 또는 비밀번호가 올바르지 않습니다')
    )
  })

  it('signs in the user and redirects to / on success', async () => {
    const formData = buildFormData({
      email: 'test@example.com',
      password: '123456',
    })

    await expect(logIn(formData)).rejects.toThrow()
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: '123456',
    })
    expect(redirectMock).toHaveBeenCalledWith('/')
  })
})
