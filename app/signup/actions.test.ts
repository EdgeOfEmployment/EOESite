import { describe, it, expect, vi, beforeEach } from 'vitest'

const signUpMock = vi.fn()
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { signUp: signUpMock } })),
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))

import { signUp } from './actions'

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
  signUpMock.mockResolvedValue({ error: null })
})

describe('signUp', () => {
  it('redirects with an error when a required field is missing', async () => {
    const formData = buildFormData({ name: '김민수', email: 'test@example.com' })

    await expect(signUp(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/signup?error=' + encodeURIComponent('모든 항목을 입력해주세요')
    )
    expect(signUpMock).not.toHaveBeenCalled()
  })

  it('redirects with an error when the password is shorter than 6 characters', async () => {
    const formData = buildFormData({
      name: '김민수',
      email: 'test@example.com',
      password: '12345',
    })

    await expect(signUp(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/signup?error=' + encodeURIComponent('비밀번호는 6자 이상이어야 합니다')
    )
    expect(signUpMock).not.toHaveBeenCalled()
  })

  it('redirects with the Supabase error message when signUp fails', async () => {
    signUpMock.mockResolvedValue({ error: { message: '이미 가입된 이메일입니다' } })
    const formData = buildFormData({
      name: '김민수',
      email: 'test@example.com',
      password: '123456',
    })

    await expect(signUp(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/signup?error=' + encodeURIComponent('이미 가입된 이메일입니다')
    )
  })

  it('signs up the user and redirects to /pending on success', async () => {
    const formData = buildFormData({
      name: '김민수',
      email: 'test@example.com',
      password: '123456',
    })

    await expect(signUp(formData)).rejects.toThrow()
    expect(signUpMock).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: '123456',
      options: { data: { name: '김민수' } },
    })
    expect(redirectMock).toHaveBeenCalledWith('/pending')
  })
})
