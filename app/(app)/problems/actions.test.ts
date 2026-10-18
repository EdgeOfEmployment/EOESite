import { describe, it, expect, vi, beforeEach } from 'vitest'

const getClaimsMock = vi.fn()
const fromMock = vi.fn()
const storageFromMock = vi.fn()
const removeMock = vi.fn()
const uploadMock = vi.fn()
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})
const updateTagMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: getClaimsMock },
    from: fromMock,
    storage: { from: storageFromMock },
  })),
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))

vi.mock('next/cache', () => ({
  updateTag: (...args: unknown[]) => updateTagMock(...args),
}))

import { createProblem, deleteProblem, updateProblem, uploadProblemImage } from './actions'
import { PROBLEM_BANK_TAG } from '@/lib/cache-tags'

const SUPABASE_URL = 'https://proj.supabase.co'
const IMAGE_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/problem-images/`
const KEY_A = '3f2b8c1e-9d4a-4f6b-8e2a-1c3d5e7f9a0b/6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.png'
const KEY_OLD = '3f2b8c1e-9d4a-4f6b-8e2a-1c3d5e7f9a0b/0f1e2d3c-4b5a-4968-8776-655443322110.png'

const content = {
  company: ' 카카오 ',
  title: '두 수의 합',
  descriptionMd: `설명 ![](${IMAGE_PREFIX}${KEY_A})`,
  constraintsMd: '',
  timeLimitMs: 1000,
  signature: { params: [{ name: 'a', type: 'int' }], returnType: 'int' },
  testCases: [{ args: [1], expected: 1, isExample: true }],
}

function payloadForm(value: unknown = content) {
  const formData = new FormData()
  formData.set('payload', JSON.stringify(value))
  return formData
}

const initial = { error: null }

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL)
  redirectMock.mockImplementation((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  })
  getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
  removeMock.mockResolvedValue({ error: null })
  uploadMock.mockResolvedValue({ error: null })
  storageFromMock.mockReturnValue({
    remove: removeMock,
    upload: uploadMock,
    getPublicUrl: (path: string) => ({ data: { publicUrl: `${IMAGE_PREFIX}${path}` } }),
  })
})

describe('createProblem', () => {
  it('returns the validation error without touching the database', async () => {
    const result = await createProblem(initial, payloadForm({ ...content, company: '' }))
    expect(result).toEqual({ error: '회사 이름은 1~30자여야 합니다' })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('rejects a missing or unparsable payload', async () => {
    expect(await createProblem(initial, new FormData())).toEqual({ error: '입력값을 확인해주세요' })
    const bad = new FormData()
    bad.set('payload', '{nope')
    expect(await createProblem(initial, bad)).toEqual({ error: '요청 형식이 올바르지 않습니다' })
  })

  it('inserts a normalized row with derived image paths, then redirects to the new problem', async () => {
    const insertMock = vi.fn(() => ({ select: () => ({ single: async () => ({ data: { id: 'p-1' }, error: null }) }) }))
    fromMock.mockReturnValue({ insert: insertMock })

    await expect(createProblem(initial, payloadForm())).rejects.toThrow('REDIRECT:/problems/p-1?success=')
    expect(fromMock).toHaveBeenCalledWith('bank_problems')
    expect(insertMock).toHaveBeenCalledWith({
      company: '카카오',
      title: '두 수의 합',
      description_md: content.descriptionMd,
      constraints_md: '',
      time_limit_ms: 1000,
      signature: content.signature,
      test_cases: content.testCases,
      image_paths: [KEY_A],
      created_by: 'user-1',
    })
    expect(updateTagMock).toHaveBeenCalledWith(PROBLEM_BANK_TAG)
  })

  it('sends an unauthenticated caller to /login', async () => {
    getClaimsMock.mockResolvedValue({ data: null })
    await expect(createProblem(initial, payloadForm())).rejects.toThrow('REDIRECT:/login')
  })
})

describe('updateProblem', () => {
  function mockUpdate(existingPaths: string[] | null, updatedRows: { id: string }[]) {
    const updateMock = vi.fn<(row: Record<string, unknown>) => unknown>(() => ({
      eq: () => ({ select: async () => ({ data: updatedRows, error: null }) }),
    }))
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: existingPaths ? { image_paths: existingPaths } : null }),
        }),
      }),
      update: updateMock,
    })
    return updateMock
  }

  it('updates the row and removes images no longer referenced', async () => {
    const updateMock = mockUpdate([KEY_A, KEY_OLD], [{ id: 'p-1' }])

    await expect(updateProblem('p-1', initial, payloadForm())).rejects.toThrow('REDIRECT:/problems/p-1?success=')
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ company: '카카오', image_paths: [KEY_A] }))
    expect(updateMock.mock.calls[0][0]).not.toHaveProperty('created_by')
    expect(removeMock).toHaveBeenCalledWith([KEY_OLD])
    expect(updateTagMock).toHaveBeenCalledWith(PROBLEM_BANK_TAG)
  })

  it('reports a missing problem', async () => {
    mockUpdate(null, [])
    expect(await updateProblem('p-1', initial, payloadForm())).toEqual({ error: '존재하지 않는 문제입니다' })
  })

  it('treats an RLS-filtered update (zero rows) as a permission error', async () => {
    mockUpdate([KEY_A], [])
    expect(await updateProblem('p-1', initial, payloadForm())).toEqual({ error: '권한이 없습니다' })
    expect(removeMock).not.toHaveBeenCalled()
    expect(updateTagMock).not.toHaveBeenCalled()
  })
})

describe('deleteProblem', () => {
  function mockDelete(rows: { image_paths: string[] }[]) {
    fromMock.mockReturnValue({
      delete: () => ({ eq: () => ({ select: async () => ({ data: rows, error: null }) }) }),
    })
  }

  it('deletes the row, removes its images, and returns to the list', async () => {
    mockDelete([{ image_paths: [KEY_A] }])
    await expect(deleteProblem('p-1')).rejects.toThrow('REDIRECT:/problems?success=')
    expect(removeMock).toHaveBeenCalledWith([KEY_A])
    expect(updateTagMock).toHaveBeenCalledWith(PROBLEM_BANK_TAG)
  })

  it('redirects back with a permission error when RLS filtered the delete', async () => {
    mockDelete([])
    await expect(deleteProblem('p-1')).rejects.toThrow(
      'REDIRECT:/problems/p-1?error=' + encodeURIComponent('권한이 없습니다')
    )
    expect(updateTagMock).not.toHaveBeenCalled()
  })
})

describe('uploadProblemImage', () => {
  function imageForm(file: File) {
    const formData = new FormData()
    formData.set('image', file)
    return formData
  }

  it('rejects non-images and oversized files before uploading', async () => {
    expect(await uploadProblemImage(imageForm(new File(['x'], 'a.txt', { type: 'text/plain' })))).toEqual({
      error: 'PNG, JPEG, GIF, WebP 이미지만 올릴 수 있어요',
    })
    const big = new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' })
    expect(await uploadProblemImage(imageForm(big))).toEqual({ error: '이미지는 4MB 이하여야 해요' })
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it("uploads under the caller's folder with an ASCII key and returns the public URL", async () => {
    const result = await uploadProblemImage(imageForm(new File(['x'], '스크린샷 1.png', { type: 'image/png' })))
    const [path] = uploadMock.mock.calls[0]
    expect(path).toMatch(/^user-1\/[0-9a-f-]{36}\.png$/)
    expect(result).toEqual({ url: `${IMAGE_PREFIX}${path}` })
  })
})
