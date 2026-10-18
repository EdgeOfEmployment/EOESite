import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('./actions', () => ({
  uploadProblemImage: vi.fn(),
}))

vi.mock('@/components/markdown', () => ({
  Markdown: ({ source }: { source: string }) => <div data-testid="markdown">{source}</div>,
}))

import { uploadProblemImage } from './actions'
import { ProblemForm } from './problem-form'
import type { ProblemContent } from '@/lib/problems/types'

const action = vi.fn(async () => ({ error: null }))

const initial: ProblemContent = {
  company: '카카오',
  title: '두 수의 합',
  descriptionMd: '설명',
  constraintsMd: '',
  timeLimitMs: 1000,
  signature: { params: [{ name: 'arr', type: 'int[]' }], returnType: 'int' },
  testCases: [{ args: [[1, 2]], expected: 3, isExample: true }],
}

function renderForm(content?: ProblemContent) {
  return render(<ProblemForm action={action} initial={content} companies={['네이버', '카카오']} submitLabel="등록" cancelHref="/problems" />)
}

describe('ProblemForm', () => {
  it('blocks submission of an empty form and says why', () => {
    renderForm()
    expect(screen.getByRole('button', { name: '등록' })).toBeDisabled()
    expect(screen.getByText('테스트 케이스에 비어 있거나 잘못된 칸이 있습니다')).toBeInTheDocument()
  })

  it('enables submission and fills the hidden payload once everything is valid', () => {
    const { container } = renderForm(initial)
    expect(screen.getByRole('button', { name: '등록' })).toBeEnabled()
    const payload = container.querySelector<HTMLInputElement>('input[name="payload"]')!
    expect(JSON.parse(payload.value)).toEqual(initial)
  })

  it('previews the display title and offers existing companies', () => {
    const { container } = renderForm(initial)
    expect(screen.getByText('게시글 제목: [카카오]-두 수의 합')).toBeInTheDocument()
    expect(Array.from(container.querySelectorAll('#company-options option')).map((o) => o.getAttribute('value'))).toEqual([
      '네이버',
      '카카오',
    ])
  })

  it('shows a typed cell error inline and disables submit', () => {
    renderForm(initial)
    fireEvent.change(screen.getByLabelText('케이스 1 arr'), { target: { value: '[1, "a"]' } })
    expect(screen.getByText('int[]의 원소는 int 범위의 정수여야 합니다')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '등록' })).toBeDisabled()
  })

  it('adds a column to every case when a param is added', () => {
    renderForm(initial)
    fireEvent.click(screen.getByRole('button', { name: '+ 파라미터 추가' }))
    fireEvent.change(screen.getByLabelText('파라미터 2 이름'), { target: { value: 'k' } })
    expect(screen.getByLabelText('케이스 1 k')).toHaveValue('')
  })

  it('marks new cases as examples only for the first two rows', () => {
    renderForm(initial)
    fireEvent.click(screen.getByRole('button', { name: '+ 케이스 추가' }))
    fireEvent.click(screen.getByRole('button', { name: '+ 케이스 추가' }))
    expect(screen.getByLabelText('케이스 2 예시')).toBeChecked()
    expect(screen.getByLabelText('케이스 3 예시')).not.toBeChecked()
  })

  it('does not submit when Enter is pressed in a cell', () => {
    renderForm(initial)
    const notPrevented = fireEvent.keyDown(screen.getByLabelText('케이스 1 arr'), { key: 'Enter' })
    expect(notPrevented).toBe(false)
  })

  it('recovers from a failed image upload', async () => {
    vi.mocked(uploadProblemImage).mockRejectedValueOnce(new Error('network'))
    renderForm(initial)
    fireEvent.change(screen.getByLabelText('문제 설명 이미지 파일'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } })
    expect(await screen.findByText('이미지를 올리지 못했어요. 다시 시도해주세요')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '이미지 추가' })[0]).toBeEnabled()
  })

  it('inserts the uploaded image into the latest text as its own paragraph', async () => {
    vi.mocked(uploadProblemImage).mockResolvedValueOnce({ url: 'https://img.example/a.png' })
    renderForm(initial)
    const textarea = screen.getByLabelText('문제 설명') as HTMLTextAreaElement
    textarea.setSelectionRange(0, 0)
    fireEvent.change(screen.getByLabelText('문제 설명 이미지 파일'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } })
    await waitFor(() => expect(textarea).toHaveValue('![](https://img.example/a.png)\n\n설명'))
  })

  // Glued to the end of a line (e.g. a table row) Markdown would read the image as part of that line.
  it('separates an image inserted at the end of a line with a blank line', async () => {
    vi.mocked(uploadProblemImage).mockResolvedValueOnce({ url: 'https://img.example/b.png' })
    renderForm(initial)
    const textarea = screen.getByLabelText('문제 설명') as HTMLTextAreaElement
    textarea.setSelectionRange(2, 2)
    fireEvent.change(screen.getByLabelText('문제 설명 이미지 파일'), { target: { files: [new File(['x'], 'b.png', { type: 'image/png' })] } })
    await waitFor(() => expect(textarea).toHaveValue('설명\n\n![](https://img.example/b.png)'))
  })
})
